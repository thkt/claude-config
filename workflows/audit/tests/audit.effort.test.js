// The effort assignment never shows up in a run result, so changing a value breaks no test but
// this one. Pinning the per-stage values makes the drift visible.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.ts";
import { defaultAgentStub } from "./_fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

// The shortest stub reaching Review -> Challenge / Verify -> Integrate; defaultAgentStub in
// _fixtures.js supplies the default responses. Empty findings return early and never advance
// past Challenge, so the integrate response is passed explicitly to carry the run that far.
// focus: "security" is chosen because the routing table puts both security and silence on
// *.js, which keeps the reviewer count at two.
const INTEGRATED = {
  findings: [{ file: "sample.js", line: "1", severity: "high", summary: "integrated finding" }],
};

const runToIntegrate = () =>
  runWorkflow(auditJs, {
    args: { repo: "/abs/target-repo", focus: "security", skipPreflight: true },
    stubs: { agent: defaultAgentStub({ integrate: INTEGRATED }) },
  });

test("the integrate agent runs at effort high", async () => {
  const { calls } = await runToIntegrate();
  const integrateCalls = calls.agent.filter((c) => c.opts && c.opts.label === "integrate");
  assert.equal(integrateCalls.length, 1, "the integrate agent (enhancer-integration) ran once");
  assert.equal(integrateCalls[0].opts.effort, "high", "the integrate agent runs at effort high");
});

test("the challenge and verify agents run at effort xhigh", async () => {
  const { calls } = await runToIntegrate();
  const challengeCalls = calls.agent.filter((c) => c.opts && c.opts.label === "challenge");
  const verifyCalls = calls.agent.filter((c) => c.opts && c.opts.label === "verify");
  assert.equal(challengeCalls.length, 1, "the challenge agent (critic-audit) ran once");
  assert.equal(verifyCalls.length, 1, "the verify agent (critic-evidence) ran once");
  assert.equal(challengeCalls[0].opts.effort, "xhigh", "the challenge agent runs at effort xhigh");
  assert.equal(verifyCalls[0].opts.effort, "xhigh", "the verify agent runs at effort xhigh");
});

// This confirms that the path where the challenge stub returns verdicts stays distinguishable
// in the return value from fail-open (no challenge response, every finding treated as
// confirmed). The verdicts shape matches VERDICTS_SCHEMA in both polish.js and audit.js:
// { verdicts: [{ id, verdict, severity, why }] }.
test("a run whose challenge stub returns verdicts carries challenge_ran=true and a counted tally", async () => {
  const { result } = await runWorkflow(auditJs, {
    args: { repo: "/abs/target-repo", focus: "security", skipPreflight: true },
    stubs: {
      agent: defaultAgentStub({
        integrate: INTEGRATED,
        challenge: {
          verdicts: [
            { id: "R-1", verdict: "confirmed" },
            { id: "R-2", verdict: "confirmed" },
          ],
        },
      }),
    },
  });
  assert.equal(
    result.challenge_ran,
    true,
    "a challenge stub returning verdicts makes challenge_ran true, separating it from fail-open",
  );
  assert.equal(result.tally.survived, 2, "the two confirmed findings count under tally.survived");
  assert.equal(result.tally.needs_context, 0, "needs_context counts zero");
  assert.equal(result.tally.no_verdict, 0, "a missing verdict counts zero");
});

// Left as general-purpose it would carry unrestricted Bash, and neither generator-snapshot's
// tools restriction (Write and python3 only) nor its Posture would apply.
test("the Snapshot stage passes generator-snapshot as the agentType", async () => {
  const { calls } = await runToIntegrate();
  const snapshotCalls = calls.agent.filter((c) => c.opts && c.opts.label === "snapshot");
  assert.equal(snapshotCalls.length, 1, "the snapshot agent ran once");
  assert.equal(
    snapshotCalls[0].opts.agentType,
    "generator-snapshot",
    "the Snapshot stage agentType is generator-snapshot",
  );
});
