// The effort assignment never shows up in a run result, so changing a value breaks no test
// but this one. Pinning the per-stage values makes the drift visible.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const polishJs = join(here, "..", "..", "polish.js");

// The shortest stub reaching Review -> Challenge -> Fix -> Rejudge -> Cleanup (mode: full).
// Without severity P1 and a confirmed challenge verdict, triage empties survivors and the run
// never advances past Fix. simplify / enhancer results are unread, so undefined is enough.
const agentStub = (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "codex") {
    return {
      available: true,
      has_changes: true,
      findings: [{ id: "F1", title: "finding title", detail: "finding detail", severity: "P1" }],
    };
  }
  if (label === "challenge") {
    return { verdicts: [{ id: "F1", verdict: "confirmed" }] };
  }
  if (label === "fix") {
    return { fixed: ["F1 fixed"], stashed: [], tests_pass: true };
  }
  if (label === "validate") {
    return { edits: [], tests_pass: true, stashed: false };
  }
  return undefined;
};

const runToFix = () =>
  runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo", scope: "sample.js" },
    stubs: { agent: agentStub },
  });

test("the fix agent runs at effort high", async () => {
  const { calls } = await runToFix();
  const fixCalls = calls.agent.filter((c) => c.opts && c.opts.label === "fix");
  assert.equal(fixCalls.length, 1, "the fix agent (general-purpose) ran once");
  assert.equal(fixCalls[0].opts.effort, "high", "the fix agent runs at effort high");
});

test("the challenge and rejudge agents run at effort xhigh", async () => {
  const { calls } = await runToFix();
  const challengeCalls = calls.agent.filter((c) => c.opts && c.opts.label === "challenge");
  const rejudgeCalls = calls.agent.filter((c) => c.opts && c.opts.label === "rejudge");
  assert.equal(challengeCalls.length, 1, "the challenge agent (critic-audit) ran once");
  assert.equal(rejudgeCalls.length, 1, "the rejudge agent (critic-audit) ran once");
  assert.equal(challengeCalls[0].opts.effort, "xhigh", "the challenge agent runs at effort xhigh");
  assert.equal(rejudgeCalls[0].opts.effort, "xhigh", "the rejudge agent runs at effort xhigh");
});
