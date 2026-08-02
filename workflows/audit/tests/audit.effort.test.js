// effort の配分は実行結果に現れないので、値を変えてもここ以外のテストは落ちない。
// per-stage の値を固定して drift を可視にする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

// Review -> Challenge/Verify -> Integrate まで到達させる最小 stub。
// findings が空だと早期 return して Challenge 以降へ進まない。focus: "security" を選ぶのは
// routing 表で security と silence がどちらも *.js に載り、reviewer が 2 件に収まるため。
// skipPreflight: true は pre-flight agent の stub を不要にする。
const agentStub = (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "route") {
    return { files: [{ path: "sample.js", churn: 0 }] };
  }
  if (label === "security" || label === "silence") {
    return {
      findings: [{ file: "sample.js", line: "1", severity: "high", summary: `${label} finding` }],
    };
  }
  if (label === "challenge") return "challenge pass output";
  if (label === "verify") return "verify pass output";
  if (label === "integrate") {
    return {
      findings: [{ file: "sample.js", line: "1", severity: "high", summary: "integrated finding" }],
    };
  }
  // snapshot は戻り値を消費しないので undefined のままでよい。
  return undefined;
};

const runToIntegrate = () =>
  runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: agentStub },
  });

test("integrate agent の effort が high である", async () => {
  const { calls } = await runToIntegrate();
  const integrateCalls = calls.agent.filter((c) => c.opts && c.opts.label === "integrate");
  assert.equal(integrateCalls.length, 1, "integrate agent (enhancer-integration) が 1 回呼ばれる");
  assert.equal(integrateCalls[0].opts.effort, "high", "integrate agent の effort が high である");
});

test("challenge / verify agent の effort が xhigh である", async () => {
  const { calls } = await runToIntegrate();
  const challengeCalls = calls.agent.filter((c) => c.opts && c.opts.label === "challenge");
  const verifyCalls = calls.agent.filter((c) => c.opts && c.opts.label === "verify");
  assert.equal(challengeCalls.length, 1, "challenge agent (critic-audit) が 1 回呼ばれる");
  assert.equal(verifyCalls.length, 1, "verify agent (critic-evidence) が 1 回呼ばれる");
  assert.equal(challengeCalls[0].opts.effort, "xhigh", "challenge agent の effort が xhigh");
  assert.equal(verifyCalls[0].opts.effort, "xhigh", "verify agent の effort が xhigh");
});

// challenge の stub が verdicts を返す経路が fail-open (challenge 未応答で全件 confirmed 扱い) と
// 区別できる形で返り値に残ることを確認する。stub の challenge 分岐は polish.js /
// audit.js 双方の VERDICTS_SCHEMA と同じ { verdicts: [{ id, verdict, severity, why }] } 形
// (rawFindings の id は R-1 = security / R-2 = silence の順、audit.triage.test.js と同じ組み方)。
const tallyAgentStub = (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "route") {
    return { files: [{ path: "sample.js", churn: 0 }] };
  }
  if (label === "security" || label === "silence") {
    return {
      findings: [{ file: "sample.js", line: "1", severity: "high", summary: `${label} finding` }],
    };
  }
  if (label === "challenge") {
    return {
      verdicts: [
        { id: "R-1", verdict: "confirmed" },
        { id: "R-2", verdict: "confirmed" },
      ],
    };
  }
  if (label === "verify") return "verify pass output";
  if (label === "integrate") {
    return {
      findings: [{ file: "sample.js", line: "1", severity: "high", summary: "integrated finding" }],
    };
  }
  return undefined;
};

test("challenge stub が verdicts を返す run は返り値に challenge_ran=true と件数の入った tally を持つ", async () => {
  const { result } = await runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: tallyAgentStub },
  });
  assert.equal(
    result.challenge_ran,
    true,
    "challenge stub が verdicts を返したら challenge_ran が true (fail-open との区別)",
  );
  assert.equal(result.tally.survived, 2, "confirmed 2 件が tally.survived に計上される");
  assert.equal(result.tally.needs_context, 0, "needs_context は 0 件");
  assert.equal(result.tally.no_verdict, 0, "verdict 欠落は 0 件");
});
