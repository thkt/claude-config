// Differential test for the workflows/_lib/gate.py -> gate.ts slice (see
// docs/decisions/0112-adopt-typescript-for-helper-scripts.md, Success Criteria: "第 1
// スライスは Python 版と TypeScript 版の出力を突き合わせる差分テストで確認する"). The unit's
// contract is workflows/_lib/gate.py's CLI contract carried over unchanged, so both sides are
// driven as CLI processes and compared on stdout JSON + exit code -- never on internal
// functions, which the CLI contract does not promise to keep identical between the two.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY_SCRIPT = join(HERE, "..", "gate.py");
const TS_SCRIPT = join(HERE, "..", "gate.ts");

// gate.ts's own spawnSync call onto the target command is what this unit's contract warns
// about: Node's spawnSync defaults to a 1MiB maxBuffer and throws ENOBUFS past it, where
// Python's subprocess.run has no such ceiling. Confirmed in this session: a 2,000,000-byte
// stdout produced ENOBUFS under Node's default maxBuffer and no error under Python. The outer
// call here only reads back a gate report bounded by --tail-bytes (12000 bytes by default),
// well under 1MiB, but the same generous ceiling is set anyway so this harness never becomes
// the thing that reintroduces the bug it exists to catch.
const MAX_BUFFER = 64 * 1024 * 1024;

type GateReport = Record<string, unknown>;

interface CliResult {
  readonly exitCode: number | null;
  readonly report: GateReport;
}

function runCli(command: string, script: string, args: readonly string[]): CliResult {
  const result = spawnSync(command, [script, ...args], { encoding: "utf8", maxBuffer: MAX_BUFFER });
  let report: GateReport;
  try {
    report = JSON.parse(result.stdout) as GateReport;
  } catch (error) {
    const stderrTail = (result.stderr || "").slice(0, 500);
    throw new Error(
      `${command} ${script} ${args.join(" ")} did not print a JSON report on stdout ` +
        `(exit ${result.status}, stderr: ${stderrTail}): ${(error as Error).message}`,
    );
  }
  return { exitCode: result.status, report };
}

// python3 matches the invocation gate_test.py itself uses; process.execPath (rather than a
// hardcoded "node") runs gate.ts under whatever Node binary is already running this suite, so
// the two never disagree about which runtime does the type stripping.
const runPython = (args: readonly string[]): CliResult => runCli("python3", PY_SCRIPT, args);
const runTypeScript = (args: readonly string[]): CliResult =>
  runCli(process.execPath, TS_SCRIPT, args);

// duration_ms is wall-clock and never equal between two independent runs. execution_error
// carries a raw OSError/Node error string whose exact wording this unit's contract excludes
// from parity -- only whether it is present (non-null) is part of the contract. Everything
// else in the report is required to match byte-for-byte.
function normalizeReport(report: GateReport): GateReport {
  const clone = JSON.parse(JSON.stringify(report)) as GateReport;
  if ("duration_ms" in clone) clone.duration_ms = null;
  const evidence = clone.evidence;
  if (evidence && typeof evidence === "object" && "execution_error" in (evidence as GateReport)) {
    const record = evidence as GateReport;
    record.execution_error = record.execution_error === null ? null : "<execution-error-text>";
  }
  return clone;
}

function assertParity(args: readonly string[], label: string): void {
  const python = runPython(args);
  const typescript = runTypeScript(args);
  assert.equal(typescript.exitCode, python.exitCode, `[${label}] exit code diverged`);
  assert.deepEqual(
    normalizeReport(typescript.report),
    normalizeReport(python.report),
    `[${label}] JSON report diverged (duration_ms and execution_error wording excluded)`,
  );
}

const withTmpDir = (fn: (cwd: string) => void): void => {
  const tmp = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "gate-differential-"));
  try {
    fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

// ---- T-006 ----------------------------------------------------------------------------
// One representative call per branch of gate.py's CLI contract (mirrors gate_test.py's own
// VerdictTest / UsageTest / CalibrationTest / CalibrationCandidateTest coverage). Each entry
// gets a fresh --cwd unless it overrides it, which the relative-path usage-error entry does.
interface MatrixEntry {
  readonly name: string;
  readonly args: (cwd: string) => readonly string[];
}

const MATRIX: readonly MatrixEntry[] = [
  {
    name: "pass gate: 期待どおりの終了で pass",
    args: (cwd) => ["--cwd", cwd, "--command", "printf 'done\\n'", "--expect", "pass"],
  },
  {
    name: "pass gate: 想定外の非ゼロ終了で fail し failure_route が渡される",
    args: (cwd) => [
      "--cwd",
      cwd,
      "--command",
      "exit 3",
      "--expect",
      "pass",
      "--failure-route",
      "green:U-001",
    ],
  },
  {
    name: "fail gate: アンカーなしは usage error として blocked",
    args: (cwd) => ["--cwd", cwd, "--command", "exit 1", "--expect", "fail"],
  },
  {
    name: "fail gate: 完全な失敗行をアンカーにすると pass",
    args: (cwd) => [
      "--cwd",
      cwd,
      "--command",
      "printf 'ok 1 - T-001 x\\nnot ok 2 - T-002 y\\n'; exit 1",
      "--expect",
      "fail",
      "--require-output",
      "not ok 2 - T-002 y",
    ],
  },
  {
    name: "fail gate: テスト名だけの部分文字列アンカーは missing_required_output",
    args: (cwd) => [
      "--cwd",
      cwd,
      "--command",
      "printf 'ok 1 - T-001 x\\nnot ok 2 - T-002 y\\n'; exit 1",
      "--expect",
      "fail",
      "--require-output",
      "T-001 x",
    ],
  },
  {
    name: "forbid-output: 禁止語が出力に部分一致すると forbidden_output",
    args: (cwd) => [
      "--cwd",
      cwd,
      "--command",
      "printf 'warning: deprecated call\\n'",
      "--expect",
      "pass",
      "--forbid-output",
      "deprecated",
    ],
  },
  {
    name: "usage error: 未知のフラグ",
    args: (cwd) => ["--cwd", cwd, "--command", "true", "--expect", "pass", "--nope", "x"],
  },
  {
    name: "usage error: 単数フラグの重複指定",
    args: (cwd) => ["--cwd", cwd, "--command", "true", "--command", "false", "--expect", "pass"],
  },
  {
    name: "usage error: 相対パスの --cwd",
    args: () => ["--cwd", "relative/dir", "--command", "true", "--expect", "pass"],
  },
  {
    name: "calibrate: アンカー無しで Red コマンドを実行し classification に calibration_ を付ける",
    args: (cwd) => [
      "--cwd",
      cwd,
      "--command",
      "printf 'not ok 1 - T-001 x\\n'; exit 1",
      "--calibrate",
    ],
  },
  {
    name: "calibrate: コマンドが想定外に成功すると calibration_unexpected_pass",
    args: (cwd) => ["--cwd", cwd, "--command", "printf 'all green\\n'", "--calibrate"],
  },
  {
    name: "calibrate: --require-output の併用は使用エラー",
    args: (cwd) => ["--cwd", cwd, "--command", "exit 1", "--calibrate", "--require-output", "x"],
  },
  {
    name: "planned-test: 指定した名前を持つ失敗行だけが候補になる",
    args: (cwd) => [
      "--cwd",
      cwd,
      "--command",
      "printf 'ok 1 - other\\nnot ok 2 - an empty query returns an error\\n'; exit 1",
      "--calibrate",
      "--planned-test",
      "T-001:an empty query returns an error",
    ],
  },
  {
    name: "planned-test: calibrate の外で指定すると使用エラー",
    args: (cwd) => [
      "--cwd",
      cwd,
      "--command",
      "true",
      "--expect",
      "pass",
      "--planned-test",
      "T-001:x",
    ],
  },
];

test("呼び出し matrix の全件で gate.py と gate.ts の JSON が duration_ms と execution_error の文言を除いて一致する", () => {
  withTmpDir((tmp) => {
    for (const entry of MATRIX) {
      assertParity(entry.args(tmp), entry.name);
    }
  });
});

// ---- T-007 ----------------------------------------------------------------------------
test("1MiB を超える出力を出すコマンドで両者とも pass を返す", () => {
  withTmpDir((tmp) => {
    // Confirmed in this session: `python3 -c "...write('a'*2_000_000)"` makes gate.py return
    // pass (subprocess.run carries no output ceiling), and the identical command run through
    // Node's spawnSync with no maxBuffer set throws ENOBUFS -- the exact failure this
    // scenario exists to catch once gate.ts is implemented.
    const args = [
      "--cwd",
      tmp,
      "--command",
      "python3 -c \"import sys; sys.stdout.write('a'*2000000)\"",
      "--expect",
      "pass",
    ];
    const python = runPython(args);
    const typescript = runTypeScript(args);
    assert.equal(python.exitCode, 0, "gate.py did not pass on a >1MiB stdout command");
    assert.equal(
      typescript.exitCode,
      0,
      "gate.ts did not pass on a >1MiB stdout command (likely ENOBUFS from an unset maxBuffer)",
    );
    assert.equal(python.report.verdict, "pass");
    assert.equal(typescript.report.verdict, "pass");
    assert.deepEqual(normalizeReport(typescript.report), normalizeReport(python.report));
  });
});

// ---- T-008 ----------------------------------------------------------------------------
test("タイムアウトしたコマンドで両者とも exit 124 と timed_out true を返す", () => {
  withTmpDir((tmp) => {
    const args = ["--cwd", tmp, "--command", "sleep 5", "--expect", "pass", "--timeout-ms", "200"];
    const python = runPython(args);
    const typescript = runTypeScript(args);
    assert.equal(python.exitCode, 124);
    assert.equal(typescript.exitCode, 124);
    assert.equal(python.report.verdict, "blocked");
    assert.equal(typescript.report.verdict, "blocked");
    const pyEvidence = python.report.evidence as GateReport;
    const tsEvidence = typescript.report.evidence as GateReport;
    assert.equal(pyEvidence.timed_out, true);
    assert.equal(tsEvidence.timed_out, true);
    assert.deepEqual(normalizeReport(typescript.report), normalizeReport(python.report));
  });
});

// ---- T-009 ----------------------------------------------------------------------------
test("シグナルで終了したコマンドで両者の exit_code と signal 名が一致する", () => {
  withTmpDir((tmp) => {
    // Confirmed in this session: gate.py reports evidence.exit_code -15 / evidence.signal
    // "SIGTERM" for `kill -TERM $$`. Node's spawnSync surfaces the same event as
    // { status: null, signal: "SIGTERM" }; gate.ts is expected to translate that back to the
    // same -15 / "SIGTERM" pair gate.py reports, not Node's native shape.
    const args = ["--cwd", tmp, "--command", "kill -TERM $$", "--expect", "pass"];
    const python = runPython(args);
    const typescript = runTypeScript(args);
    const pyEvidence = python.report.evidence as GateReport;
    const tsEvidence = typescript.report.evidence as GateReport;
    assert.equal(typescript.exitCode, python.exitCode);
    assert.equal(tsEvidence.exit_code, pyEvidence.exit_code);
    assert.equal(tsEvidence.signal, pyEvidence.signal);
    assert.deepEqual(normalizeReport(typescript.report), normalizeReport(python.report));
  });
});
