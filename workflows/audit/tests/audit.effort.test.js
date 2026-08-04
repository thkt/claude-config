// effort の配分は実行結果に現れないので、値を変えてもここ以外のテストは落ちない。
// per-stage の値を固定して drift を可視にする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";
import { defaultAgentStub } from "./_fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

// Review -> Challenge/Verify -> Integrate まで到達させる最小 stub (既定応答は _fixtures.js の
// defaultAgentStub)。findings が空だと早期 return して Challenge 以降へ進まないので、
// Integrate まで届けるため integrate の応答を明示的に渡す。focus: "security" を選ぶのは
// routing 表で security と silence がどちらも *.js に載り、reviewer が 2 件に収まるため。
const INTEGRATED = {
  findings: [{ file: "sample.js", line: "1", severity: "high", summary: "integrated finding" }],
};

const runToIntegrate = () =>
  runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: defaultAgentStub({ integrate: INTEGRATED }) },
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
// 区別できる形で返り値に残ることを確認する。verdicts の形は polish.js / audit.js 双方の
// VERDICTS_SCHEMA と同じ { verdicts: [{ id, verdict, severity, why }] }。
test("challenge stub が verdicts を返す run は返り値に challenge_ran=true と件数の入った tally を持つ", async () => {
  const { result } = await runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
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
    "challenge stub が verdicts を返したら challenge_ran が true (fail-open との区別)",
  );
  assert.equal(result.tally.survived, 2, "confirmed 2 件が tally.survived に計上される");
  assert.equal(result.tally.needs_context, 0, "needs_context は 0 件");
  assert.equal(result.tally.no_verdict, 0, "verdict 欠落は 0 件");
});

// general-purpose のままだと無制限の Bash が付き、generator-snapshot の tools 制限
// (Write と python3 のみ) も Posture も働かない。
test("Snapshot 段の agent 起動は agentType に generator-snapshot を渡す", async () => {
  const { calls } = await runToIntegrate();
  const snapshotCalls = calls.agent.filter((c) => c.opts && c.opts.label === "snapshot");
  assert.equal(snapshotCalls.length, 1, "snapshot agent が 1 回呼ばれる");
  assert.equal(
    snapshotCalls[0].opts.agentType,
    "generator-snapshot",
    "Snapshot 段の agentType が generator-snapshot である",
  );
});
