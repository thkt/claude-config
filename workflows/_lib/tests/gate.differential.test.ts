/// <reference types="node" />
// Differential tests for workflows/_lib/gate.ts against workflows/_lib/gate.py: for the same
// argv the two must return the same JSON and the same exit code (contract: gate.py's CLI,
// moved to TypeScript as-is). gate.ts is a Red-step scaffold, so every test here is expected
// to fail against it until a later unit fills in the real parity implementation.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY_SCRIPT = join(HERE, "..", "gate.py");
const TS_SCRIPT = join(HERE, "..", "gate.ts");

// node:child_process.spawnSync caps stdout/stderr at a 1 MiB maxBuffer by default. A command
// under test that legitimately prints more than that (T-007) then throws ENOBUFS before this
// harness ever sees the child's real exit -- which reads back here as a blocked run for input
// gate.py itself reports pass on. Both runners below pass maxBuffer explicitly past what the
// call matrix's commands can print.
const MAX_BUFFER = 64 * 1024 * 1024;

interface GateRun {
  status: number | null;
  report: Record<string, unknown>;
}

function runCli(script: string, executable: string, args: readonly string[]): GateRun {
  const result = spawnSync(executable, [script, ...args], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  return { status: result.status, report: JSON.parse(result.stdout) };
}

const runPython = (args: readonly string[]): GateRun => runCli(PY_SCRIPT, "python3", args);
const runTs = (args: readonly string[]): GateRun => runCli(TS_SCRIPT, process.execPath, args);

// duration_ms is wall-clock and never matches across two separate processes; execution_error
// carries each runtime's own OSError / Node error wording. Neither is part of the contract
// this test enforces, per this unit's own scope note.
function normalize(report: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
  delete clone.duration_ms;
  const evidence = clone.evidence;
  if (evidence && typeof evidence === "object" && "execution_error" in evidence) {
    const evidenceRecord = evidence as Record<string, unknown>;
    evidenceRecord.execution_error =
      evidenceRecord.execution_error === null ? null : "<execution_error>";
  }
  return clone;
}

function withTempDir<T>(fn: (cwd: string) => T): T {
  const cwd = mkdtempSync(join(tmpdir(), "gate-differential-"));
  try {
    return fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

interface MatrixCase {
  name: string;
  buildArgs: (cwd: string) => string[];
}

// Mirrors the CLI-level coverage workflows/_lib/tests/gate_test.py already carries for
// gate.py: one representative call per verdict/classification branch, plus the usage-error
// shapes. gate.py's own contract is the source for each shape, not this file.
const CALL_MATRIX: MatrixCase[] = [
  {
    name: "pass expect が exit 0 のコマンドで pass になる",
    buildArgs: (cwd) => ["--cwd", cwd, "--command", "printf 'done\\n'", "--expect", "pass"],
  },
  {
    name: "pass expect がコマンドの非 0 終了で fail し failure_route を返す",
    buildArgs: (cwd) => [
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
    name: "fail expect がアンカー無しで blocked になる",
    buildArgs: (cwd) => ["--cwd", cwd, "--command", "exit 1", "--expect", "fail"],
  },
  {
    name: "fail expect が完全一致するアンカーで pass になる",
    buildArgs: (cwd) => [
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
    name: "fail expect がテスト名だけのアンカーで missing_required_output になる",
    buildArgs: (cwd) => [
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
    name: "forbid-output が部分一致で fail する",
    buildArgs: (cwd) => [
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
    name: "calibrate がアンカー無しで実行され calibration_expected_failure になる",
    buildArgs: (cwd) => [
      "--cwd",
      cwd,
      "--command",
      "printf 'not ok 1 - T-001 x\\n'; exit 1",
      "--calibrate",
    ],
  },
  {
    name: "calibrate した command が想定外に成功して calibration_unexpected_pass になる",
    buildArgs: (cwd) => ["--cwd", cwd, "--command", "printf 'all green\\n'", "--calibrate"],
  },
  {
    name: "calibrate に require-output を渡すと blocked になる",
    buildArgs: (cwd) => [
      "--cwd",
      cwd,
      "--command",
      "exit 1",
      "--calibrate",
      "--require-output",
      "x",
    ],
  },
  {
    name: "planned-test がマーカー付きで名前が一致する行だけを候補にする",
    buildArgs: (cwd) => [
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
    name: "未知のフラグが usage_error として blocked になる",
    buildArgs: (cwd) => ["--cwd", cwd, "--command", "true", "--expect", "pass", "--nope", "x"],
  },
  {
    name: "単一値フラグの重複が usage_error として blocked になる",
    buildArgs: (cwd) => [
      "--cwd",
      cwd,
      "--command",
      "true",
      "--command",
      "false",
      "--expect",
      "pass",
    ],
  },
  {
    name: "相対 cwd が usage_error として blocked になる",
    buildArgs: () => ["--cwd", "relative/dir", "--command", "true", "--expect", "pass"],
  },
];

test("T-006 呼び出し matrix の全件で gate.py と gate.ts の JSON が duration_ms と execution_error の文言を除いて一致する", () => {
  for (const { name, buildArgs } of CALL_MATRIX) {
    withTempDir((cwd) => {
      const args = buildArgs(cwd);
      const py = runPython(args);
      const ts = runTs(args);
      assert.equal(ts.status, py.status, `${name}: exit code`);
      assert.deepEqual(normalize(ts.report), normalize(py.report), `${name}: report`);
    });
  }
});

test("T-007 1MiB を超える出力を出すコマンドで両者とも pass を返す", () => {
  withTempDir((cwd) => {
    // 2 MiB of stdout: past both the gate's own --tail-bytes default and the 1 MiB
    // spawnSync maxBuffer default this harness works around above.
    const command = "python3 -c \"import sys; sys.stdout.write('x' * 2_000_000)\"";
    const args = ["--cwd", cwd, "--command", command, "--expect", "pass"];
    const py = runPython(args);
    const ts = runTs(args);
    assert.equal(py.report.verdict, "pass", "gate.py itself must report pass on this input");
    assert.equal(ts.status, py.status, "exit code");
    assert.deepEqual(normalize(ts.report), normalize(py.report), "report");
  });
});

test("T-008 タイムアウトしたコマンドで両者とも exit 124 と timed_out true を返す", () => {
  withTempDir((cwd) => {
    const args = ["--cwd", cwd, "--command", "sleep 5", "--expect", "pass", "--timeout-ms", "200"];
    const py = runPython(args);
    const ts = runTs(args);
    assert.equal(py.status, 124, "gate.py itself must report exit 124 on this input");
    assert.equal(ts.status, py.status, "exit code");
    assert.equal(
      (py.report.evidence as Record<string, unknown>).timed_out,
      true,
      "gate.py itself must report timed_out true on this input",
    );
    assert.equal(
      (ts.report.evidence as Record<string, unknown> | undefined)?.timed_out,
      true,
      "timed_out",
    );
  });
});

test("T-009 シグナルで終了したコマンドで両者の exit_code と signal 名が一致する", () => {
  withTempDir((cwd) => {
    const args = ["--cwd", cwd, "--command", "kill -TERM $$", "--expect", "pass"];
    const py = runPython(args);
    const ts = runTs(args);
    const pyEvidence = py.report.evidence as Record<string, unknown>;
    assert.equal(pyEvidence.signal, "SIGTERM", "gate.py itself must report SIGTERM on this input");
    assert.equal(ts.status, py.status, "exit code");
    const tsEvidence = ts.report.evidence as Record<string, unknown> | undefined;
    assert.equal(tsEvidence?.exit_code, pyEvidence.exit_code, "evidence.exit_code");
    assert.equal(tsEvidence?.signal, pyEvidence.signal, "evidence.signal");
  });
});
