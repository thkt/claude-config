// challenge / verify / integrate が結果を返さない run (fail-open) を、全件 confirmed の
// run と区別できる形で記録する挙動を固定する。WORKFLOWS.md § Degradation recording の
// "失敗が飲み込まれ fail-open で次段に進む" 行に対応: 何が検証できなかったか、未検証である
// ことが challenge_ran / verify_ran として返り値と snapshot payload の両方に残る。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

// Route -> Review (security / silence の 2 reviewer) -> Challenge/Verify -> Integrate まで
// 通す最小 stub。focus: "security" で rawFindings の id を R-1 (security) / R-2 (silence) に
// 固定するのは audit.triage.test.js / audit.effort.test.js と同じ組み方。
// verify は既定で出力を返す。verify_ran の fail-open を突く test だけが verify: undefined を
// 明示的に渡す。デフォルト引数は値が undefined のとき発動してしまい「返さなかった」を表現
// できないので、キーが渡されたかどうかで既定値を分ける。
const agentStub =
  (opt = {}) =>
  (prompt, opts) => {
    const { challenge, integrate } = opt;
    const verify = "verify" in opt ? opt.verify : "verify pass output";
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
    if (label === "verify") return verify;
    if (label === "integrate") return integrate;
    // snapshot は戻り値を消費しない経路にフォールバックさせるため undefined のまま。
    return undefined;
  };

const callOf = (calls, label) => calls.agent.find((c) => c.opts && c.opts.label === label);

// snapshot agent への prompt 末尾に payload が JSON.stringify の 1 行で埋め込まれる
// (audit.js の writeSnapshot 参照)。そこを取り出して parse する。
const snapshotPayload = (calls) => {
  const call = callOf(calls, "snapshot");
  assert.ok(call, "snapshot agent が起動する");
  const match = call.prompt.match(/The payload is as follows\.\n(.*)$/s);
  assert.ok(match, "snapshot prompt に payload が乗る");
  return JSON.parse(match[1]);
};

const run = (opts) =>
  runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: agentStub(opts) },
  });

const INTEGRATED = {
  findings: [{ file: "sample.js", line: "1", severity: "high", summary: "integrated finding" }],
};

test("T-005 challenge が結果を返さない run は返り値と snapshot payload の両方に challenge_ran=false を持つ", async () => {
  const { result, calls } = await run({ challenge: undefined, integrate: INTEGRATED });
  assert.equal(
    result.challenge_ran,
    false,
    "challenge が結果を返さないとき返り値の challenge_ran は false",
  );
  const payload = snapshotPayload(calls);
  assert.equal(payload.challenge_ran, false, "snapshot payload の challenge_ran も false");
});

test("T-006 challenge が全件を confirmed と判定した run は challenge_ran=true を持ち fail-open した run と区別できる", async () => {
  const { result, calls } = await run({
    challenge: {
      verdicts: [
        { id: "R-1", verdict: "confirmed" },
        { id: "R-2", verdict: "confirmed" },
      ],
    },
    integrate: INTEGRATED,
  });
  assert.equal(
    result.challenge_ran,
    true,
    "challenge が verdict を返したとき challenge_ran は true",
  );
  const payload = snapshotPayload(calls);
  assert.equal(payload.challenge_ran, true, "snapshot payload の challenge_ran も true");
});

test("T-020 verify が結果を返さない run は返り値と snapshot payload の両方に verify_ran=false を持つ", async () => {
  const { result, calls } = await run({
    challenge: { verdicts: [{ id: "R-1", verdict: "confirmed" }] },
    integrate: INTEGRATED,
    verify: undefined,
  });
  assert.equal(result.verify_ran, false, "verify が結果を返さないとき返り値の verify_ran は false");
  const payload = snapshotPayload(calls);
  assert.equal(payload.verify_ran, false, "snapshot payload の verify_ran も false");
});

test("T-021 verify が出力を返した run は verify_ran=true を持ち fail-open した run と区別できる", async () => {
  const { result, calls } = await run({
    challenge: { verdicts: [{ id: "R-1", verdict: "confirmed" }] },
    integrate: INTEGRATED,
  });
  assert.equal(result.verify_ran, true, "verify が出力を返したとき verify_ran は true");
  const payload = snapshotPayload(calls);
  assert.equal(payload.verify_ran, true, "snapshot payload の verify_ran も true");
});

test("T-007 Integrate が結果を返さないとき最終 findings は survivors であって triage 前の findings ではない", async () => {
  const { result } = await run({
    challenge: {
      verdicts: [
        { id: "R-1", verdict: "confirmed" },
        { id: "R-2", verdict: "disputed" },
      ],
    },
    integrate: undefined,
  });
  assert.deepEqual(
    result.findings.map((f) => f.id),
    ["R-1"],
    "Integrate が結果を返さないとき最終 findings は disputed を除いた survivors になる",
  );
});

test("T-008 needs_context の finding は survivors から外れて返り値の needs_context に載る", async () => {
  const { result } = await run({
    challenge: {
      verdicts: [
        { id: "R-1", verdict: "confirmed" },
        { id: "R-2", verdict: "needs_context", why: "human judgement needed" },
      ],
    },
    integrate: INTEGRATED,
  });
  assert.deepEqual(
    result.survivors.map((s) => s.id),
    ["R-1"],
    "needs_context の R-2 は survivors から外れる",
  );
  assert.deepEqual(
    result.needs_context.map((n) => n.id),
    ["R-2"],
    "needs_context の R-2 は返り値の needs_context に載る",
  );
});
