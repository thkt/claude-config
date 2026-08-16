// These pin two behaviors of the Integrate stage: keeping the R-N ids it absorbed in each root
// cause's source_ids, and narrowing its input to survivors alone (a disputed finding is never
// handed back to integrate). polish.js has no matching stage, so id tracking is a requirement
// specific to audit.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";
import { defaultAgentStub, callOf } from "./_fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

// The shortest stub carrying Route -> Review (the security and silence reviewers) ->
// Challenge / Verify -> Integrate. focus: "security" pins the rawFindings ids to R-1 (security)
// and R-2 (silence); defaultAgentStub in _fixtures.js supplies the default responses.
const run = (opts) =>
  runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
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
