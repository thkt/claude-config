// audit.js が組んだ snapshot payload を実 workflows/audit/snapshot.py まで通し、書き出された
// record から R-N id / verdict tally / zero-reviewer file を追える挙動を固定する。
// audit.degradation.test.js は "snapshot" ラベルを常に undefined へフォールバックさせて payload
// の中身だけ検証するが、ここでは snapshot ラベルを実 subprocess 実行に差し替え、ディスクに
// 書かれた record 自体を検証する (U-001〜U-006 が組んだ各段が実際につながっているかの seam)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");
const snapshotPy = join(here, "..", "snapshot.py");

// snapshot.py の HISTORY_DIR は $HOME/.claude/history 由来 (snapshot.py 参照)。テストごとに
// HOME を隔離した一時ディレクトリへ向け、実ユーザーの履歴を書き換えず、テスト間の record も
// 混ざらないようにする。
const runSnapshot = (payload) => {
  const home = mkdtempSync(join(tmpdir(), "audit-seam-"));
  const res = spawnSync("python3", [snapshotPy], {
    input: payload,
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
  assert.equal(res.status, 0, `snapshot.py が exit 0 で終わる (stderr: ${res.stderr})`);
  const outPath = res.stdout.trim();
  return JSON.parse(readFileSync(outPath, "utf8"));
};

const INTEGRATED = {
  findings: [{ file: "sample.js", line: "1", severity: "high", summary: "integrated finding" }],
};

// audit.js の writeSnapshot は payload を prompt 末尾に JSON.stringify 1行で埋め込む
// (audit.degradation.test.js の snapshotPayload と同じ抽出)。snapshot ラベルの呼び出しだけ実
// snapshot.py に流し、書き出された record を run() の戻り値として返す。
const run = async (routeFiles, { security, silence, challenge, integrate } = {}) => {
  let record;
  const agentStub = (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "route") return { files: routeFiles };
    if (label === "security") return security;
    if (label === "silence") return silence;
    if (label === "challenge") return challenge;
    if (label === "verify") return "verify pass output";
    if (label === "integrate") return integrate;
    if (label === "snapshot") {
      const match = prompt.match(/The payload is as follows\.\n(.*)$/s);
      assert.ok(match, "snapshot prompt に payload が乗る");
      record = runSnapshot(match[1]);
      return undefined;
    }
    return undefined;
  };
  const { result, calls } = await runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: agentStub },
  });
  return { result, calls, record };
};

test("T-017 reviewer の findings を実 snapshot.py まで流すと、書き出された record に R-N id と verdict tally が載る", async () => {
  const { record } = await run([{ path: "sample.js", churn: 0 }], {
    security: {
      findings: [{ file: "sample.js", line: "1", severity: "high", summary: "security finding" }],
    },
    silence: {
      findings: [{ file: "sample.js", line: "1", severity: "high", summary: "silence finding" }],
    },
    challenge: {
      verdicts: [
        { id: "R-1", verdict: "confirmed" },
        { id: "R-2", verdict: "confirmed" },
      ],
    },
    integrate: INTEGRATED,
  });
  assert.ok(record, "snapshot が record をディスクに書き出す");
  assert.deepEqual(
    record.raw_findings.map((f) => f.id).sort(),
    ["R-1", "R-2"],
    "書き出された record の raw_findings から R-N id を追える",
  );
  assert.ok(record.tally, "record に verdict tally が載る");
  assert.equal(record.tally.survived, 2, "tally.survived に confirmed 2 件が計上される");
  // AC は集約値でなく「finding ごとの verdict が載る」を求める。payload ではなく実際に
  // 書き出された record 側で、id と verdict が対応していることを確かめる。
  assert.equal(
    record.raw_findings.find((f) => f.id === "R-1").verdict,
    "confirmed",
    "書き出された record の finding ごとに verdict が載る",
  );
});

test("T-018 fail-open した run を実 snapshot.py まで流すと、書き出された record に degraded 印が載り件数の入った tally は載らない", async () => {
  const { record } = await run([{ path: "sample.js", churn: 0 }], {
    security: {
      findings: [{ file: "sample.js", line: "1", severity: "high", summary: "security finding" }],
    },
    silence: {
      findings: [{ file: "sample.js", line: "1", severity: "high", summary: "silence finding" }],
    },
    challenge: undefined,
    integrate: undefined,
  });
  assert.ok(record, "snapshot が record をディスクに書き出す");
  assert.equal(
    record.challenge_ran,
    false,
    "fail-open した run は record.challenge_ran=false で degraded と分かる",
  );
  assert.equal(record.tally, undefined, "件数の入った tally は record に載らない");
});

test("T-019 focus=security でテストファイルのみの diff を流すと、0 reviewer で落ちたファイルが書き出された record に載る", async () => {
  const { record } = await run([{ path: "sample.test.js", churn: 0 }], {});
  assert.ok(record, "snapshot が record をディスクに書き出す");
  assert.ok(
    Array.isArray(record.zero_reviewer_files) &&
      record.zero_reviewer_files.some((f) => f.path === "sample.test.js"),
    "0 reviewer で落ちた sample.test.js が record に載る",
  );
});
