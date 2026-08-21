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
// extra overrides a reviewer's own response, which the disposition cases need to make a reviewer
// declare a value at all.
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

// A reviewer that declares nothing must still produce a countable disposition. Left absent, a
// reader has to fall back to severity, which is the axis this one exists to stop answering with.
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

// An override with no reason is a preference stated as a verdict. Falling back silently would
// leave the reader unable to tell a declared must from one the script restored.
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

// findingsSchema drops every key it does not list, so a reviewer can fill category and trigger
// and the report still shows neither. These two are what the prune quality reads.
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

// Required fields would fail the whole findings array of a reviewer that returns no trigger, so
// the two stay optional and an absent one stays absent rather than becoming an empty string.
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
