// These pin two behaviors of the Integrate stage: keeping the R-N ids it absorbed in each root
// cause's source_ids, and narrowing its input to survivors alone (a disputed finding is never
// handed back to integrate). polish.js has no matching stage, so id tracking is a requirement
// specific to audit.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.ts";
import { defaultAgentStub, callOf, snapshotPayload } from "./_fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

// The shortest stub carrying Route -> Review (the security and silence reviewers) ->
// Challenge / Verify -> Integrate. focus: "security" pins the rawFindings ids to R-1 (security)
// and R-2 (silence); defaultAgentStub in _fixtures.js supplies the default responses.
const run = (opts) =>
  runWorkflow(auditJs, {
    args: { repo: "/abs/target-repo", focus: "security", skipPreflight: true },
    stubs: { agent: defaultAgentStub(opts) },
  });

const BOTH_CONFIRMED = {
  verdicts: [
    { id: "R-1", verdict: "confirmed" },
    { id: "R-2", verdict: "confirmed" },
  ],
};

test("T-023 requires source_ids on the Integrate schema alone, and the reviewer one lacks the property", async () => {
  const { calls } = await run({ challenge: BOTH_CONFIRMED, integrate: { findings: [] } });
  const item = (label) => callOf(calls, label).opts.schema.properties.findings.items;

  const integrate = item("integrate");
  assert.ok(
    integrate.required.includes("source_ids"),
    "without source_ids required, an Integrate run that omits it still validates and R-N tracking breaks per run",
  );

  const reviewer = item("security");
  assert.equal(
    reviewer.properties.source_ids,
    undefined,
    "the reviewer schema lacks source_ids, so additionalProperties: false rejects an invented id",
  );
  assert.equal(
    reviewer.required.includes("source_ids"),
    false,
    "a reviewer is never asked for source_ids",
  );
});

test("T-009 keeps the source_ids Integrate returns in the findings of the return value", async () => {
  const { result, calls } = await run({
    challenge: BOTH_CONFIRMED,
    integrate: {
      findings: [
        {
          file: "sample.js",
          line: "1",
          severity: "high",
          summary: "root cause absorbing both findings",
          source_ids: ["R-1", "R-2"],
        },
      ],
    },
  });
  assert.deepEqual(
    result.findings[0].source_ids,
    ["R-1", "R-2"],
    "the source_ids Integrate returned ride the return value's findings unchanged",
  );
  const integrateCall = callOf(calls, "integrate");
  assert.ok(integrateCall, "the integrate agent started");
  const itemSchema = integrateCall.opts.schema.properties.findings.items;
  assert.equal(
    itemSchema.properties.source_ids && itemSchema.properties.source_ids.type,
    "array",
    "the finding item of FINDINGS_SCHEMA defines source_ids as an array",
  );
});

test("T-010 leaves a finding judged disputed out of the input handed to Integrate", async () => {
  const { calls } = await run({
    challenge: {
      verdicts: [
        { id: "R-1", verdict: "confirmed" },
        { id: "R-2", verdict: "disputed" },
      ],
    },
    integrate: { findings: [] },
  });
  const integrateCall = callOf(calls, "integrate");
  assert.ok(integrateCall, "the integrate agent started");
  assert.doesNotMatch(
    integrateCall.prompt,
    /R-2/,
    "R-2, judged disputed, drops out of the integrate input",
  );
});

test("T-011 ends with as many findings as survivors when Integrate returns every survivor", async () => {
  const { result, calls } = await run({
    challenge: BOTH_CONFIRMED,
    // The free-form verify output carries no survivor content (no summary). That keeps the
    // premise that survivor content in the integrate prompt can only come from the survivors
    // input itself.
    verify: "verify pass output",
    integrate: {
      findings: [
        {
          file: "sample.js",
          line: "1",
          severity: "high",
          summary: "security finding",
          source_ids: ["R-1"],
        },
        {
          file: "sample.js",
          line: "1",
          severity: "high",
          summary: "silence finding",
          source_ids: ["R-2"],
        },
      ],
    },
  });
  assert.equal(
    result.findings.length,
    result.survivors.length,
    "a run where Integrate returned every survivor ends with as many findings as survivors",
  );
  const integrateCall = callOf(calls, "integrate");
  assert.ok(integrateCall, "the integrate agent started");
  for (const s of result.survivors) {
    assert.match(
      integrateCall.prompt,
      new RegExp(s.message),
      `the content of survivor ${s.id} (${s.message}) rides the integrate input (survivors)`,
    );
  }
});

// Each case has Integrate return a disposition the script must not trust, so an implementation
// that kept whatever Integrate said would fail here rather than pass by coincidence.
test("T-024 consolidating imo with must gives the finding a disposition of must", async () => {
  const { result } = await run({
    security: {
      findings: [{ file: "sample.js", line: "1", severity: "high", summary: "security finding" }],
    },
    silence: {
      findings: [
        {
          file: "sample.js",
          line: "1",
          severity: "high",
          summary: "silence finding",
          disposition: "imo",
          disposition_reason: "author preference",
        },
      ],
    },
    challenge: BOTH_CONFIRMED,
    integrate: {
      findings: [
        {
          file: "sample.js",
          line: "1",
          severity: "high",
          summary: "root cause absorbing both findings",
          source_ids: ["R-1", "R-2"],
          // Deliberately not the expected value: nothing Integrate returns should survive.
          disposition: "nits",
        },
      ],
    },
  });
  assert.equal(
    result.findings[0].disposition,
    "must",
    "R-1 stayed at the default must and R-2 declared imo, so the consolidated value is the stronger of the two (must > imo), not the nits Integrate returned",
  );
});

test("T-025 sources that all stayed at the default consolidate to must", async () => {
  const { result } = await run({
    security: {
      findings: [{ file: "sample.js", line: "1", severity: "high", summary: "security finding" }],
    },
    silence: {
      findings: [{ file: "sample.js", line: "1", severity: "high", summary: "silence finding" }],
    },
    challenge: BOTH_CONFIRMED,
    integrate: {
      findings: [
        {
          file: "sample.js",
          line: "1",
          severity: "high",
          summary: "root cause absorbing both findings",
          source_ids: ["R-1", "R-2"],
          // Same deliberate mismatch as T-024, here against sources that both stayed default.
          disposition: "want",
        },
      ],
    },
  });
  assert.equal(
    result.findings[0].disposition,
    "must",
    "neither R-1 nor R-2 declared an override, so both stayed at the default must and the consolidated value is must, not the want Integrate returned",
  );
});

// T-024 and T-025 both expect the default, so a consolidation hardcoded to must would pass
// both. This is the case the Outcome names: two declared values merging, where the winner is
// the stronger declared one rather than the default.
test("T-026 consolidating want with imo gives the finding a disposition of want", async () => {
  const declared = (summary, disposition) => ({
    file: "sample.js",
    line: "1",
    severity: "high",
    summary,
    disposition,
    disposition_reason: "author preference",
  });
  const { result } = await run({
    security: { findings: [declared("security finding", "imo")] },
    silence: { findings: [declared("silence finding", "want")] },
    challenge: BOTH_CONFIRMED,
    integrate: {
      findings: [
        {
          file: "sample.js",
          line: "1",
          severity: "high",
          summary: "root cause absorbing both findings",
          source_ids: ["R-1", "R-2"],
          disposition: "nits",
        },
      ],
    },
  });
  assert.equal(
    result.findings[0].disposition,
    "want",
    "want outranks imo, so neither the weaker source nor the default decides the merged value",
  );
});

// The sort contract mirrors workflows/assert.js's mergeIssues: SEVERITY_RANK descending, then
// file ascending (localeCompare), then line ascending. It applies once, right after
// finalFindings is assembled, so the return value's findings and the snapshot payload's
// findings must carry the identical order.
test("T-101 findings come back in critical, high, medium, low order when the integrate stage returns them reversed", async () => {
  const { result, calls } = await run({
    challenge: BOTH_CONFIRMED,
    integrate: {
      findings: [
        { file: "a.js", line: "1", severity: "low", summary: "low finding", source_ids: ["R-1"] },
        {
          file: "a.js",
          line: "2",
          severity: "medium",
          summary: "medium finding",
          source_ids: ["R-1"],
        },
        {
          file: "a.js",
          line: "3",
          severity: "high",
          summary: "high finding",
          source_ids: ["R-1"],
        },
        {
          file: "a.js",
          line: "4",
          severity: "critical",
          summary: "critical finding",
          source_ids: ["R-1"],
        },
      ],
    },
  });
  assert.deepEqual(
    result.findings.map((f) => f.severity),
    ["critical", "high", "medium", "low"],
    "the reversed integrate order comes back sorted critical -> high -> medium -> low",
  );
  const snap = snapshotPayload(calls);
  assert.deepEqual(
    snap.findings.map((f) => f.severity),
    ["critical", "high", "medium", "low"],
    "the snapshot's findings carry the same severity order as the return value",
  );
});

test("T-102 findings sharing a severity come back ordered by file", async () => {
  const { result, calls } = await run({
    challenge: BOTH_CONFIRMED,
    integrate: {
      findings: [
        { file: "b.js", line: "1", severity: "high", summary: "b finding", source_ids: ["R-1"] },
        { file: "a.js", line: "1", severity: "high", summary: "a finding", source_ids: ["R-1"] },
      ],
    },
  });
  assert.deepEqual(
    result.findings.map((f) => f.file),
    ["a.js", "b.js"],
    "two findings sharing severity high come back ordered a.js before b.js",
  );
  const snap = snapshotPayload(calls);
  assert.deepEqual(
    snap.findings.map((f) => f.file),
    ["a.js", "b.js"],
    "the snapshot's findings carry the same file order as the return value",
  );
});

test("T-103 findings sharing a severity and a file come back ordered by line", async () => {
  const { result, calls } = await run({
    challenge: BOTH_CONFIRMED,
    integrate: {
      findings: [
        { file: "a.js", line: "10", severity: "high", summary: "line ten", source_ids: ["R-1"] },
        { file: "a.js", line: "9", severity: "high", summary: "line nine", source_ids: ["R-1"] },
      ],
    },
  });
  assert.deepEqual(
    result.findings.map((f) => f.line),
    ["9", "10"],
    'line 9 sorts before line 10 numerically, not lexicographically (a lexicographic sort would put "10" first)',
  );
  const snap = snapshotPayload(calls);
  assert.deepEqual(
    snap.findings.map((f) => f.line),
    ["9", "10"],
    "the snapshot's findings carry the same line order as the return value",
  );
});

test("T-104 a finding with no severity comes back last and stays in the findings array", async () => {
  const { result, calls } = await run({
    challenge: BOTH_CONFIRMED,
    integrate: {
      // Neither the input order nor the filename order matches the expected output, so a
      // comparator that falls through to the file compare on an unranked severity puts the
      // no-severity finding first and fails here.
      findings: [
        { file: "a.js", line: "1", summary: "no severity finding", source_ids: ["R-1"] },
        {
          file: "z.js",
          line: "1",
          severity: "critical",
          summary: "critical finding",
          source_ids: ["R-1"],
        },
        { file: "b.js", line: "1", severity: "low", summary: "low finding", source_ids: ["R-1"] },
      ],
    },
  });
  assert.equal(
    result.findings.length,
    3,
    "the no-severity finding is not dropped from the findings array",
  );
  assert.deepEqual(
    result.findings.map((f) => f.summary),
    ["critical finding", "low finding", "no severity finding"],
    "the finding with no severity sorts after every finding that carries one",
  );
  const snap = snapshotPayload(calls);
  assert.deepEqual(
    snap.findings.map((f) => f.summary),
    ["critical finding", "low finding", "no severity finding"],
    "the snapshot's findings carry the same order as the return value",
  );
});
