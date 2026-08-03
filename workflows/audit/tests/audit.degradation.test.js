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
// 固定する。
// verify は既定で出力を返す。verify_ran の fail-open を突く test だけが verify: undefined を
// 明示的に渡す。デフォルト引数は値が undefined のとき発動してしまい「返さなかった」を表現
// できないので、キーが渡されたかどうかで既定値を分ける。
const agentStub =
  (opt = {}) =>
  (prompt, opts) => {
    const { challenge, integrate } = opt;
    const verify = "verify" in opt ? opt.verify : "verify pass output";
    const snapshot = opt.snapshot;
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
    // snapshot の既定は undefined (agent が結果を返さなかった経路)。件数の照合を突く test
    // だけが件数つきの返り値を渡す。
    if (label === "snapshot") return snapshot;
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

const BOTH_CONFIRMED = {
  verdicts: [
    { id: "R-1", verdict: "confirmed" },
    { id: "R-2", verdict: "confirmed" },
  ],
};

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

test("T-022 disputed で落ちた finding も snapshot payload の raw_findings に verdict つきで残る", async () => {
  const { calls } = await run({
    challenge: {
      verdicts: [
        { id: "R-1", verdict: "disputed" },
        { id: "R-2", verdict: "needs_context", why: "呼び出し元が不明" },
      ],
    },
    integrate: INTEGRATED,
  });
  const payload = snapshotPayload(calls);
  const byId = Object.fromEntries(payload.raw_findings.map((f) => [f.id, f]));
  assert.equal(
    byId["R-1"].verdict,
    "disputed",
    "survivors から外れた finding も id と verdict を record に残す",
  );
  assert.equal(byId["R-2"].verdict, "needs_context", "needs_context の finding も verdict を残す");
  assert.equal(
    byId["R-1"].reviewer,
    "security",
    "reviewer と verdict を突き合わせて生存率を測れる",
  );
  assert.deepEqual(
    payload.needs_context.map((f) => f.id),
    ["R-2"],
    "needs_context の id が payload にも載る",
  );
});

// snapshot.py が stdout に返す counts の形。agent はこれをそのまま持ち帰る。
const counts = (over) => ({
  raw_findings: 2,
  findings: 1,
  skipped: 0,
  needs_context: 0,
  zero_reviewer_files: 0,
  ...over,
});

test("T-028 downgraded の finding は元の severity と下げ後の両方を record に残す", async () => {
  const { calls } = await run({
    challenge: {
      verdicts: [
        { id: "R-1", verdict: "downgraded", severity: "low" },
        { id: "R-2", verdict: "confirmed" },
      ],
    },
    integrate: INTEGRATED,
  });
  // reviewer が severity を過大に付ける傾向は、元の値と下げ後の差でしか測れない。survivors は
  // 下げ後しか持たず、Integrate が merge した後は finding 単位で追えない。
  const payload = snapshotPayload(calls);
  const raw = Object.fromEntries(payload.raw_findings.map((f) => [f.id, f]));
  assert.equal(raw["R-1"].severity, "high", "元の severity は reviewer が付けた値のまま残る");
  assert.equal(raw["R-1"].downgraded_to, "low", "critic が下げた先も併せて残る");
  assert.equal(raw["R-2"].downgraded_to, undefined, "downgraded でない finding に下げ先は付かない");
});

test("T-024 snapshot.py が数えた件数が payload と食い違う run は失われた配列名を返す", async () => {
  const { result } = await run({
    challenge: BOTH_CONFIRMED,
    integrate: INTEGRATED,
    // reviewer 2 体が 1 件ずつ返すので payload の raw_findings は 2 件。書き写しの途中で
    // 1 件落ちた状況を作る。
    snapshot: { path: "/tmp/audit-x.json", counts: counts({ raw_findings: 1 }) },
  });
  assert.equal(result.snapshot.truncated, true, "件数が食い違えば truncated を立てる");
  assert.deepEqual(
    result.snapshot.lost,
    ["raw_findings"],
    "どの配列が痩せたかを名前で残す。件数だけでは何を失ったか読めない",
  );
  assert.equal(result.snapshot.expected.raw_findings, 2, "期待した件数が残る");
  assert.equal(result.snapshot.actual.raw_findings, 1, "snapshot.py が数えた実件数も残る");
});

test("T-025 件数が payload と一致する run は snapshot.truncated=false を返す", async () => {
  const { result } = await run({
    challenge: BOTH_CONFIRMED,
    integrate: INTEGRATED,
    snapshot: { path: "/tmp/audit-y.json", counts: counts() },
  });
  assert.equal(result.snapshot.truncated, false, "一致すれば truncated は false");
  assert.deepEqual(result.snapshot.lost, [], "失われた配列は無い");
  assert.equal(result.snapshot.written, true, "record が書かれたことも返り値に残る");
});

test("T-027 raw_findings 以外の配列が痩せた run も検出する", async () => {
  const { result } = await run({
    challenge: {
      verdicts: [
        { id: "R-1", verdict: "confirmed" },
        { id: "R-2", verdict: "needs_context", why: "呼び出し元が不明" },
      ],
    },
    integrate: INTEGRATED,
    // needs_context は 1 件あるのに record 側が 0 件。raw_findings と findings だけを
    // 見ていると、この欠落は素通りする。
    snapshot: { path: "/tmp/audit-z.json", counts: counts({ raw_findings: 2, findings: 1 }) },
  });
  assert.deepEqual(
    result.snapshot.lost,
    ["needs_context"],
    "側表の欠落も検出する。needs_context は why を持つ唯一の場所で raw_findings から復元できない",
  );
});

test("T-026 snapshot agent が結果を返さない run は written=false を持ち truncated を断定しない", async () => {
  const { result } = await run({ challenge: BOTH_CONFIRMED, integrate: INTEGRATED });
  assert.equal(result.snapshot.written, false, "結果が無い run は written=false");
  assert.equal(
    result.snapshot.truncated,
    null,
    "書かれたか未確認の run を truncated=false と断定しない",
  );
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
