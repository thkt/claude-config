// effort の配分は実行結果に現れないので、値を変えてもここ以外のテストは落ちない。
// per-stage の値を固定して drift を可視にする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const polishJs = join(here, "..", "..", "polish.js");

// Review -> Challenge -> Fix -> Rejudge -> Cleanup まで到達させる最小 stub (mode: full)。
// severity を P1、challenge の verdict を confirmed にしないと triage が survivors を
// 空にして Fix 以降へ進まない。simplify / enhancer は戻り値を消費しないので undefined でよい。
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
    args: { scope: "sample.js" },
    stubs: { agent: agentStub },
  });

test("fix agent の effort が high である", async () => {
  const { calls } = await runToFix();
  const fixCalls = calls.agent.filter((c) => c.opts && c.opts.label === "fix");
  assert.equal(fixCalls.length, 1, "fix agent (general-purpose) が 1 回呼ばれる");
  assert.equal(fixCalls[0].opts.effort, "high", "fix agent の effort が high である");
});

test("challenge / rejudge agent の effort が xhigh である", async () => {
  const { calls } = await runToFix();
  const challengeCalls = calls.agent.filter((c) => c.opts && c.opts.label === "challenge");
  const rejudgeCalls = calls.agent.filter((c) => c.opts && c.opts.label === "rejudge");
  assert.equal(challengeCalls.length, 1, "challenge agent (critic-audit) が 1 回呼ばれる");
  assert.equal(rejudgeCalls.length, 1, "rejudge agent (critic-audit) が 1 回呼ばれる");
  assert.equal(challengeCalls[0].opts.effort, "xhigh", "challenge agent の effort が xhigh");
  assert.equal(rejudgeCalls[0].opts.effort, "xhigh", "rejudge agent の effort が xhigh");
});
