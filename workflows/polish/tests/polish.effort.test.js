// U-004: polish workflow の fix agent (general-purpose) は effort: high、
// challenge (critic-audit) agent は難易度軸で effort: xhigh。
// runWorkflow behavioral capture で Review -> Challenge -> Fix まで到達させ、
// 各段の opts.effort を検査して per-stage 配分をテストで固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const polishJs = join(here, "..", "..", "polish.js");

// Review -> Challenge -> Fix -> Cleanup まで到達させる最小 stub (mode: full)。
// - codex review: 1 件 finding (P1) を返し has_changes: true にして Challenge へ進める。
// - challenge: 同じ id を confirmed で返し、triage で survivors に載せて Fix へ進める。
// - fix: 最小の FIX_SCHEMA 形状を返す。
// - validate (Cleanup): 最小の CLEANUP_SCHEMA 形状を返す。
// - simplify / enhancer は戻り値を消費しないので undefined のままでよい。
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

test("challenge agent の effort が xhigh である", async () => {
  const { calls } = await runToFix();
  const challengeCalls = calls.agent.filter((c) => c.opts && c.opts.label === "challenge");
  assert.equal(challengeCalls.length, 1, "challenge agent (critic-audit) が 1 回呼ばれる");
  assert.equal(challengeCalls[0].opts.effort, "xhigh", "challenge agent の effort が xhigh");
});
