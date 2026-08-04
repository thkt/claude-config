// _fixtures.js を使う側の test は audit.js の挙動を見ており、fixture 自身の挙動は
// どこも見ない。既定値の差し替えを壊しても利用側の test は通ってしまうため、ここで固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";
import { defaultAgentStub, callOf, snapshotPayload } from "./_fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

const BOTH_CONFIRMED = {
  verdicts: [
    { id: "R-1", verdict: "confirmed" },
    { id: "R-2", verdict: "confirmed" },
  ],
};

const INTEGRATED = {
  findings: [{ file: "sample.js", line: "1", severity: "high", summary: "integrated finding" }],
};

const run = (overrides) =>
  runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: defaultAgentStub(overrides) },
  });

test("既定の stub は security に R-1、silence に R-2 が付く findings を返す", async () => {
  const { calls } = await run({ challenge: BOTH_CONFIRMED, integrate: INTEGRATED });

  const payload = snapshotPayload(calls);
  assert.ok(payload, "snapshot prompt から payload を取り出せる");
  const byReviewer = Object.fromEntries(payload.raw_findings.map((f) => [f.reviewer, f.id]));
  assert.equal(byReviewer.security, "R-1", "security の finding に R-1 が付く");
  assert.equal(byReviewer.silence, "R-2", "silence の finding に R-2 が付く");
});

test("呼び出し側が渡した応答は既定より優先される", async () => {
  // 既定 (未指定) の challenge は undefined で fail-open (verdict 無しは全件 confirmed 扱いの
  // survivors) になる。ここでは呼び出し側が両方 disputed を渡し、既定の挙動を上書きして
  // survivors が空になることを見る。
  const { result } = await run({
    challenge: {
      verdicts: [
        { id: "R-1", verdict: "disputed" },
        { id: "R-2", verdict: "disputed" },
      ],
    },
    integrate: INTEGRATED,
  });

  assert.deepEqual(
    result.survivors,
    [],
    "呼び出し側が渡した disputed 応答が既定 (未指定時の fail-open) より優先され、survivors が空になる",
  );
});

test("キーを渡さなかった段と undefined を明示的に渡した段が区別される", async () => {
  const { result: notPassed } = await run({ challenge: BOTH_CONFIRMED, integrate: INTEGRATED });
  assert.equal(
    notPassed.verify_ran,
    true,
    "verify キーを渡さなかった段は既定の出力を返し verify_ran は true",
  );

  const { result: explicitUndefined } = await run({
    challenge: BOTH_CONFIRMED,
    integrate: INTEGRATED,
    verify: undefined,
  });
  assert.equal(
    explicitUndefined.verify_ran,
    false,
    "verify: undefined を明示的に渡した段は出力を返さず verify_ran は false",
  );
});

// callOf 自体の直接動作も固定する。上の3 test は snapshotPayload/agentStub 経由の間接
// 検証のみなので、callOf 単体の呼び出し結果もここで見る。
test("callOf は指定した label の呼び出しを calls.agent から見つける", async () => {
  const { calls } = await run({ challenge: BOTH_CONFIRMED, integrate: INTEGRATED });
  const challengeCall = callOf(calls, "challenge");
  assert.ok(challengeCall, "callOf で challenge 段の呼び出しが見つかる");
  assert.equal(challengeCall.opts.label, "challenge");
});
