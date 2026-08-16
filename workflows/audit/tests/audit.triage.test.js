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
const runChallenge = (challenge) =>
  runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: defaultAgentStub({ challenge }) },
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
