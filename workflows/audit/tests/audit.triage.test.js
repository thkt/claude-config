// challenge (critic-audit) を id 付き rawFindings で駆動し、survivor 判定を script 側の
// triage ループ (finding 側を回して verdict を引く) に持たせる挙動を先に固定する。
// polish.js の VERDICTS_SCHEMA (confirmed/disputed/downgraded/needs_context) を踏襲する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

// Route -> Review (security / silence の 2 reviewer) -> Challenge まで通す最小 stub。
// focus: "security" は ROUTING["*.js"] を security / silence だけに絞り、rawFindings の
// id を R-1 (security) / R-2 (silence) に固定する。
const agentStub =
  ({ challenge } = {}) =>
  (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "route") {
      return { files: [{ path: "sample.js", churn: 0 }] };
    }
    if (label === "security") {
      return {
        findings: [{ file: "sample.js", line: "1", severity: "high", summary: "security finding" }],
      };
    }
    if (label === "silence") {
      return {
        findings: [{ file: "sample.js", line: "1", severity: "high", summary: "silence finding" }],
      };
    }
    if (label === "challenge") return challenge;
    if (label === "verify") return "verify pass output";
    // integrate / snapshot は戻り値を消費しない経路にフォールバックさせるため undefined のまま。
    return undefined;
  };

const callOf = (calls, label) => calls.agent.find((c) => c.opts && c.opts.label === label);

const runChallenge = (challenge) =>
  runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: agentStub({ challenge }) },
  });

test("T-001 challenge が disputed を返した finding は survivors から外れる", async () => {
  const { result } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "confirmed" },
      { id: "R-2", verdict: "disputed" },
    ],
  });
  assert.deepEqual(
    result.survivors.map((s) => s.id),
    ["R-1"],
    "disputed の R-2 は survivors に残らない",
  );
});

test("T-002 challenge が downgraded を返した finding は下げた severity で survivors に残る", async () => {
  const { result } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "downgraded", severity: "low" },
      { id: "R-2", verdict: "confirmed" },
    ],
  });
  const byId = new Map(result.survivors.map((s) => [s.id, s]));
  assert.equal(byId.get("R-1").severity, "low", "downgraded は下げた severity で残る");
  assert.equal(byId.get("R-2").severity, "high", "confirmed は元の severity のまま残る");
});

test("T-003 challenge が verdict を返さなかった finding は confirmed 扱いで survivors に入り no_verdict に計上される", async () => {
  const { result, logs } = await runChallenge({
    verdicts: [{ id: "R-1", verdict: "confirmed" }],
  });
  assert.deepEqual(
    result.survivors.map((s) => s.id).sort(),
    ["R-1", "R-2"],
    "verdict の付かなかった R-2 も confirmed 扱いで survivors に入る",
  );
  const byId = new Map(result.survivors.map((s) => [s.id, s]));
  assert.equal(byId.get("R-2").severity, "high", "confirmed 扱いなので元の severity のまま");
  assert.ok(
    logs.some((l) => /no_verdict/.test(l) && /1/.test(l)),
    "verdict の付かなかった件数が no_verdict として log() に出る",
  );
});

test("T-004 critic に渡す入力に reviewer 名が含まれない", async () => {
  const { calls } = await runChallenge({
    verdicts: [
      { id: "R-1", verdict: "confirmed" },
      { id: "R-2", verdict: "confirmed" },
    ],
  });
  const call = callOf(calls, "challenge");
  assert.ok(call, "challenge agent が起動する");
  assert.match(call.prompt, /"id":"R-1"/, "critic 入力に rawFindings の id (R-N) が乗る");
  assert.doesNotMatch(call.prompt, /"reviewer"/, "critic 入力に reviewer 名は含めない");
});
