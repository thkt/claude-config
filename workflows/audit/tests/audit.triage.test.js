// These pin the behavior of driving challenge (critic-audit) with id-carrying rawFindings and
// leaving the survivor decision to the script-side triage loop (walking the findings and
// looking up each verdict). It follows polish.js's VERDICTS_SCHEMA
// (confirmed / disputed / downgraded / needs_context).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";
import { defaultAgentStub, callOf } from "./_fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

// The shortest stub carrying Route -> Review (the security and silence reviewers) -> Challenge.
// defaultAgentStub in _fixtures.js decides the default responses and the id numbering.
// extra overrides a reviewer's own response, which the disposition cases need to declare one.
const runChallenge = (challenge, extra = {}) =>
  runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: defaultAgentStub({ challenge, ...extra }) },
  });

test("T-001 drops a finding from survivors when challenge returns disputed", async () => {
  const { result } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "confirmed" },
      { id: "R-2", verdict: "disputed" },
    ],
  });
  assert.deepEqual(
    result.survivors.map((s) => s.id),
    ["R-1"],
    "the disputed R-2 does not stay in survivors",
  );
});

test("T-002 keeps a downgraded finding in survivors at the lowered severity", async () => {
  const { result } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "downgraded", severity: "low" },
      { id: "R-2", verdict: "confirmed" },
    ],
  });
  const byId = new Map(result.survivors.map((s) => [s.id, s]));
  assert.equal(byId.get("R-1").severity, "low", "a downgraded finding stays at the lower severity");
  assert.equal(byId.get("R-2").severity, "high", "a confirmed finding keeps its own severity");
});

test("T-003 treats a finding with no verdict as confirmed and counts it under no_verdict", async () => {
  const { result, logs } = await runChallenge({
    verdicts: [{ id: "R-1", verdict: "confirmed" }],
  });
  assert.deepEqual(
    result.survivors.map((s) => s.id).sort(),
    ["R-1", "R-2"],
    "R-2, which drew no verdict, enters survivors as confirmed",
  );
  const byId = new Map(result.survivors.map((s) => [s.id, s]));
  assert.equal(byId.get("R-2").severity, "high", "treated as confirmed, so its severity stands");
  assert.ok(
    logs.some((l) => /no_verdict/.test(l) && /1/.test(l)),
    "log() carries the count of findings that drew no verdict as no_verdict",
  );
});

// Left absent, the reader falls back to severity, the axis this one exists to stop answering with.
test("T-005 a finding declaring no disposition carries must after triage", async () => {
  const { result } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "confirmed" },
      { id: "R-2", verdict: "confirmed" },
    ],
  });
  assert.deepEqual(
    result.survivors.map((s) => s.disposition),
    ["must", "must"],
    "the script fills the default rather than leaving the field absent",
  );
});

// Falling back silently leaves a declared must and a restored one reading the same.
test("T-006 an override without a disposition_reason falls back to must and the count reaches log()", async () => {
  const { result, logs } = await runChallenge(
    {
      verdicts: [
        { id: "R-1", verdict: "confirmed" },
        { id: "R-2", verdict: "confirmed" },
      ],
    },
    {
      security: {
        findings: [
          { file: "sample.js", line: "1", severity: "high", summary: "s", disposition: "nits" },
        ],
      },
    },
  );
  const byId = new Map(result.survivors.map((s) => [s.id, s]));
  assert.equal(byId.get("R-1").disposition, "must", "a reasonless override is restored to must");
  assert.equal(byId.get("R-1").disposition_reason, undefined, "no reason is invented for it");
  assert.ok(
    logs.some((l) => /disposition/.test(l) && /1/.test(l)),
    "log() carries how many overrides were restored",
  );
});

// findingsSchema drops every key it does not list, so both reach the report only once listed.
test("T-007 the category and trigger a reviewer returned stay on the survivor", async () => {
  const { result } = await runChallenge(
    {
      verdicts: [
        { id: "R-1", verdict: "confirmed" },
        { id: "R-2", verdict: "confirmed" },
      ],
    },
    {
      security: {
        findings: [
          {
            file: "sample.js",
            line: "1",
            severity: "high",
            summary: "s",
            category: "injection",
            trigger: "every Bash tool call",
          },
        ],
      },
    },
  );
  const byId = new Map(result.survivors.map((s) => [s.id, s]));
  assert.equal(byId.get("R-1").category, "injection");
  assert.equal(byId.get("R-1").trigger, "every Bash tool call");
});

// Required, these would fail the whole findings array of a reviewer that returns no trigger.
test("T-008 a finding with no trigger stays a survivor and its trigger stays absent", async () => {
  const { result } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "confirmed" },
      { id: "R-2", verdict: "confirmed" },
    ],
  });
  const byId = new Map(result.survivors.map((s) => [s.id, s]));
  assert.ok(byId.get("R-1"), "the finding survives without a trigger");
  assert.equal(byId.get("R-1").trigger, undefined, "the absent trigger is not filled in");
});

test("T-004 leaves the reviewer name out of the input handed to the critic", async () => {
  const { calls } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "confirmed" },
      { id: "R-2", verdict: "confirmed" },
    ],
  });
  const call = callOf(calls, "challenge");
  assert.ok(call, "the challenge agent started");
  assert.match(call.prompt, /"id":"R-1"/, "the critic input carries the rawFindings id (R-N)");
  assert.doesNotMatch(call.prompt, /"reviewer"/, "the critic input carries no reviewer name");
});

test("T-009 a needs_context finding returns in the ask section carrying its why", async () => {
  const { result } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "confirmed" },
      {
        id: "R-2",
        verdict: "needs_context",
        why: "severity depends on whether this endpoint is internal-only",
      },
    ],
  });
  assert.deepEqual(
    result.ask.map((a) => ({ id: a.id, why: a.why })),
    [{ id: "R-2", why: "severity depends on whether this endpoint is internal-only" }],
    "the ask section carries the needs_context finding's id and why",
  );
});

test("T-010 a disputed finding returns as a count and an id, never its full text", async () => {
  const { result } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "disputed" },
      { id: "R-2", verdict: "confirmed" },
    ],
  });
  assert.deepEqual(
    result.info.disputed,
    { count: 1, ids: ["R-1"] },
    "info.disputed carries only the count and id of the disputed finding",
  );
  assert.ok(
    !JSON.stringify(result.info).includes("security finding"),
    "the disputed finding's summary text does not leak into info",
  );
});

// info naming a finding is not a removal, which is why this asserts both sides.
test("T-011 a downgraded finding is named in info while staying a survivor", async () => {
  const { result } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "downgraded", severity: "low" },
      { id: "R-2", verdict: "confirmed" },
    ],
  });
  assert.deepEqual(
    result.info.downgraded,
    { count: 1, ids: ["R-1"] },
    "info.downgraded carries only the count and id of the re-scored finding",
  );
  assert.ok(
    result.survivors.some((s) => s.id === "R-1"),
    "the re-scored finding is still a survivor: a lowered severity is not a removal",
  );
});

const FULL_FINDING = {
  file: "sample.js",
  line: "1",
  severity: "high",
  summary: "s",
  evidence: "await inside a for-of over 200 ids",
  reasoning: "each iteration waits a full round trip",
  fix: "collect the promises and await once",
  verification: "pattern_search. does any caller pass fewer than 10 ids?",
};

test("T-012 the evidence, reasoning, fix and verification a reviewer returned stay on the survivor", async () => {
  const { result } = await runChallenge(
    {
      verdicts: [
        { id: "R-1", verdict: "confirmed" },
        { id: "R-2", verdict: "confirmed" },
      ],
    },
    { security: { findings: [FULL_FINDING] } },
  );
  const survivor = result.survivors.find((s) => s.id === "R-1");
  for (const key of ["evidence", "reasoning", "fix", "verification"]) {
    assert.equal(survivor[key], FULL_FINDING[key], `${key} survives triage`);
  }
});

// Required, these four would fail the whole findings array of most of the eighteen reviewers.
test("T-013 a finding carrying none of the four stays a survivor with all four absent", async () => {
  const { result } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "confirmed" },
      { id: "R-2", verdict: "confirmed" },
    ],
  });
  const survivor = result.survivors.find((s) => s.id === "R-1");
  assert.ok(survivor, "the finding survives without them");
  for (const key of ["evidence", "reasoning", "fix", "verification"]) {
    assert.equal(survivor[key], undefined, `${key} stays absent rather than becoming empty`);
  }
});
