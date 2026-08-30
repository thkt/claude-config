// Ported subset of workflows/_lib/tests/gate_test.py's own coverage onto gate.ts (see
// docs/decisions/0112-adopt-typescript-for-helper-scripts.md). gate.differential.test.ts
// already proves gate.py and gate.ts agree on the CLI contract; this file instead proves
// gate.ts's own behavior the way gate_test.py proves gate.py's -- some scenarios by driving
// the CLI (mirroring gate_test.py's VerdictTest / UsageTest / CalibrationTest), one by calling
// an exported function directly (mirroring gate_test.py's TailTest). Only a subset of
// gate_test.py's 26 tests is ported in this pass; the rest arrive in later units.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "gate.ts");

// Matches gate.differential.test.ts's own MAX_BUFFER: well over the --tail-bytes-bounded
// report this reads back, kept generous so this harness never becomes the ENOBUFS bug it is
// not the one guarding against (see gate.differential.test.ts's T-007 for that guard).
const MAX_BUFFER = 64 * 1024 * 1024;

type GateReport = Record<string, unknown>;

interface CliResult {
  readonly exitCode: number | null;
  readonly report: GateReport;
}

function runCli(args: readonly string[]): CliResult {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  let report: GateReport;
  try {
    report = JSON.parse(result.stdout) as GateReport;
  } catch (error) {
    const stderrTail = (result.stderr || "").slice(0, 500);
    throw new Error(
      `gate.ts ${args.join(" ")} did not print a JSON report on stdout ` +
        `(exit ${result.status}, stderr: ${stderrTail}): ${(error as Error).message}`,
    );
  }
  return { exitCode: result.status, report };
}

const withTmpDir = (fn: (cwd: string) => void): void => {
  const tmp = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "gate-test-"));
  try {
    fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

// ---- T-010 ------------------------------------------------------------------------------
test("未知フラグと重複 singleton と相対 cwd とアンカー無しの expect fail が blocked と usage_error になる", () => {
  withTmpDir((cwd) => {
    const unknownFlag = runCli([
      "--cwd",
      cwd,
      "--command",
      "true",
      "--expect",
      "pass",
      "--nope",
      "x",
    ]);
    assert.equal(unknownFlag.exitCode, 2);
    assert.equal(unknownFlag.report.verdict, "blocked");
    assert.equal(unknownFlag.report.classification, "usage_error");
    assert.match(String(unknownFlag.report.error), /unknown argument: --nope/);

    const repeatedSingleton = runCli([
      "--cwd",
      cwd,
      "--command",
      "true",
      "--command",
      "false",
      "--expect",
      "pass",
    ]);
    assert.equal(repeatedSingleton.exitCode, 2);
    assert.equal(repeatedSingleton.report.verdict, "blocked");
    assert.equal(repeatedSingleton.report.classification, "usage_error");
    assert.match(String(repeatedSingleton.report.error), /only once/);

    const relativeCwd = runCli(["--cwd", "relative/dir", "--command", "true", "--expect", "pass"]);
    assert.equal(relativeCwd.exitCode, 2);
    assert.equal(relativeCwd.report.verdict, "blocked");
    assert.equal(relativeCwd.report.classification, "usage_error");
    assert.match(String(relativeCwd.report.error), /--cwd must be absolute/);

    const noAnchor = runCli(["--cwd", cwd, "--command", "exit 1", "--expect", "fail"]);
    assert.equal(noAnchor.exitCode, 2);
    assert.equal(noAnchor.report.verdict, "blocked");
    assert.equal(noAnchor.report.classification, "usage_error");
    assert.match(String(noAnchor.report.error), /--require-output/);
  });
});

// ---- T-011 ------------------------------------------------------------------------------
// Dynamic import (rather than a static one at file top) so a missing gate.ts fails only this
// test, not the whole file -- T-010 / T-012 / T-013 drive gate.ts as a CLI process and must
// keep reporting on their own regardless of this test's outcome.
test("切り詰めが残した先頭行が tail から落ち、完全な行が無ければ tail が空になる", async () => {
  const { tail } = await import("../gate.ts");
  assert.equal(tail(Buffer.from("alpha\nbeta\n"), 8), "beta\n");
  assert.equal(tail(Buffer.from("alphabeta"), 4), "");
});

// ---- T-012 ------------------------------------------------------------------------------
test("完全な 1 行と一致しないアンカーが missing_required_output で落ち、禁止出力が forbidden_output で落ちる", () => {
  withTmpDir((cwd) => {
    const partialAnchor = runCli([
      "--cwd",
      cwd,
      "--command",
      "printf 'ok 1 - T-001 x\\nnot ok 2 - T-002 y\\n'; exit 1",
      "--expect",
      "fail",
      "--require-output",
      "T-001 x",
    ]);
    assert.equal(partialAnchor.exitCode, 1);
    assert.equal(partialAnchor.report.verdict, "fail");
    assert.deepEqual(partialAnchor.report.reason_codes, ["missing_required_output"]);

    const forbidden = runCli([
      "--cwd",
      cwd,
      "--command",
      "printf 'warning: deprecated call\\n'",
      "--expect",
      "pass",
      "--forbid-output",
      "deprecated",
    ]);
    assert.equal(forbidden.exitCode, 1);
    assert.deepEqual(forbidden.report.reason_codes, ["forbidden_output"]);
  });
});

// ---- T-013 ------------------------------------------------------------------------------
test("calibrate がアンカー無しで走り classification に calibration_ が付き、アンカー指定と expect pass を拒否する", () => {
  withTmpDir((cwd) => {
    const calibrated = runCli([
      "--cwd",
      cwd,
      "--command",
      "printf 'not ok 1 - T-001 x\\n'; exit 1",
      "--calibrate",
    ]);
    assert.equal(calibrated.exitCode, 0);
    assert.equal(calibrated.report.verdict, "pass");
    assert.equal(calibrated.report.classification, "calibration_expected_failure");
    assert.equal(calibrated.report.expected, "fail");

    const anchorRejected = runCli([
      "--cwd",
      cwd,
      "--command",
      "exit 1",
      "--calibrate",
      "--require-output",
      "x",
    ]);
    assert.equal(anchorRejected.exitCode, 2);
    assert.match(String(anchorRejected.report.error), /takes no --require-output/);

    const passRejected = runCli([
      "--cwd",
      cwd,
      "--command",
      "exit 1",
      "--calibrate",
      "--expect",
      "pass",
    ]);
    assert.equal(passRejected.exitCode, 2);
    assert.match(String(passRejected.report.error), /--expect must be fail/);
  });
});
