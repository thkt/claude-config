/// <reference types="node" />
// Behavior tests for workflows/_lib/gate.ts, ported from workflows/_lib/tests/gate_test.py
// (the .py file stays until every scenario it covers has a home here; the ones already
// exercised as cross-checks live in workflows/_lib/tests/gate.differential.test.ts instead).
// gate.ts is a Red-step scaffold, so every test here is expected to fail against it until a
// later unit fills in the real parity implementation.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TS_SCRIPT = join(HERE, "..", "gate.ts");

interface GateRun {
  status: number | null;
  report: Record<string, unknown>;
}

function runCli(args: readonly string[]): GateRun {
  const result = spawnSync(process.execPath, [TS_SCRIPT, ...args], { encoding: "utf8" });
  return { status: result.status, report: JSON.parse(result.stdout) };
}

function withTempDir<T>(fn: (cwd: string) => T): T {
  const cwd = mkdtempSync(join(tmpdir(), "gate-test-"));
  try {
    return fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("T-010 未知フラグと重複 singleton と相対 cwd とアンカー無しの expect fail が blocked と usage_error になる", () => {
  withTempDir((cwd) => {
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
    assert.equal(unknownFlag.status, 2, "unknown flag: exit code");
    assert.equal(unknownFlag.report.verdict, "blocked", "unknown flag: verdict");
    assert.equal(unknownFlag.report.classification, "usage_error", "unknown flag: classification");
    assert.match(String(unknownFlag.report.error), /unknown argument: --nope/);

    const duplicateSingleton = runCli([
      "--cwd",
      cwd,
      "--command",
      "true",
      "--command",
      "false",
      "--expect",
      "pass",
    ]);
    assert.equal(duplicateSingleton.status, 2, "duplicate singleton: exit code");
    assert.equal(duplicateSingleton.report.verdict, "blocked", "duplicate singleton: verdict");
    assert.equal(
      duplicateSingleton.report.classification,
      "usage_error",
      "duplicate singleton: classification",
    );
    assert.match(String(duplicateSingleton.report.error), /only once/);

    const noAnchor = runCli(["--cwd", cwd, "--command", "exit 1", "--expect", "fail"]);
    assert.equal(noAnchor.status, 2, "no anchor: exit code");
    assert.equal(noAnchor.report.verdict, "blocked", "no anchor: verdict");
    assert.equal(noAnchor.report.classification, "usage_error", "no anchor: classification");
    assert.match(String(noAnchor.report.error), /--require-output/);
  });

  const relativeCwd = runCli(["--cwd", "relative/dir", "--command", "true", "--expect", "pass"]);
  assert.equal(relativeCwd.status, 2, "relative cwd: exit code");
  assert.equal(relativeCwd.report.verdict, "blocked", "relative cwd: verdict");
  assert.equal(relativeCwd.report.classification, "usage_error", "relative cwd: classification");
  assert.match(String(relativeCwd.report.error), /--cwd must be absolute/);
});

test("T-011 切り詰めが残した先頭行が tail から落ち、完全な行が無ければ tail が空になる", () => {
  // gate.py's own test exercises tail() as a direct unit import. gate.ts's tsconfig
  // (workflows/../tsconfig.json, owned by U-001, out of this unit's file scope) sets no
  // allowImportingTsExtensions, so a same-repo .ts-to-.ts import of an internal helper fails
  // tsc's TS5097 while a Node-runtime-only extensionless specifier fails module resolution --
  // there is no specifier both accept. evidence.stdout_tail is tail()'s own output on the
  // CLI's surface, so the truncation behavior is observed through it instead.
  withTempDir((cwd) => {
    const incompleteFirstLineDropped = runCli([
      "--cwd",
      cwd,
      "--command",
      "printf 'alpha\\nbeta\\n'",
      "--expect",
      "pass",
      "--tail-bytes",
      "8",
    ]);
    const incompleteEvidence = incompleteFirstLineDropped.report.evidence as
      | Record<string, unknown>
      | undefined;
    assert.equal(
      incompleteEvidence?.stdout_tail,
      "beta\n",
      "the cut lands mid-line, so the incomplete first line is dropped",
    );

    const noCompleteLine = runCli([
      "--cwd",
      cwd,
      "--command",
      "printf 'alphabeta'",
      "--expect",
      "pass",
      "--tail-bytes",
      "4",
    ]);
    const noCompleteLineEvidence = noCompleteLine.report.evidence as
      | Record<string, unknown>
      | undefined;
    assert.equal(
      noCompleteLineEvidence?.stdout_tail,
      "",
      "no newline survives the cut, so there is no complete line to return",
    );
  });
});

test("T-012 完全な 1 行と一致しないアンカーが missing_required_output で落ち、禁止出力が forbidden_output で落ちる", () => {
  withTempDir((cwd) => {
    const nameOnlyAnchor = runCli([
      "--cwd",
      cwd,
      "--command",
      "printf 'ok 1 - T-001 x\\nnot ok 2 - T-002 y\\n'; exit 1",
      "--expect",
      "fail",
      "--require-output",
      "T-001 x",
    ]);
    assert.equal(nameOnlyAnchor.status, 1, "name-only anchor: exit code");
    assert.equal(nameOnlyAnchor.report.verdict, "fail", "name-only anchor: verdict");
    assert.deepEqual(nameOnlyAnchor.report.reason_codes, ["missing_required_output"]);

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
    assert.equal(forbidden.status, 1, "forbidden output: exit code");
    assert.equal(forbidden.report.verdict, "fail", "forbidden output: verdict");
    assert.deepEqual(forbidden.report.reason_codes, ["forbidden_output"]);
  });
});

test("T-013 calibrate がアンカー無しで走り classification に calibration_ が付き、アンカー指定と expect pass を拒否する", () => {
  withTempDir((cwd) => {
    const noAnchorRun = runCli([
      "--cwd",
      cwd,
      "--command",
      "printf 'not ok 1 - T-001 x\\n'; exit 1",
      "--calibrate",
    ]);
    assert.equal(noAnchorRun.status, 0, "calibrate without anchor: exit code");
    assert.equal(noAnchorRun.report.verdict, "pass", "calibrate without anchor: verdict");
    assert.equal(
      noAnchorRun.report.classification,
      "calibration_expected_failure",
      "calibrate without anchor: classification",
    );

    const anchoredCalibrate = runCli([
      "--cwd",
      cwd,
      "--command",
      "exit 1",
      "--calibrate",
      "--require-output",
      "x",
    ]);
    assert.equal(anchoredCalibrate.status, 2, "calibrate with anchor: exit code");
    assert.equal(anchoredCalibrate.report.verdict, "blocked", "calibrate with anchor: verdict");
    assert.match(String(anchoredCalibrate.report.error), /takes no --require-output/);

    const calibratePassExpectation = runCli([
      "--cwd",
      cwd,
      "--command",
      "exit 1",
      "--calibrate",
      "--expect",
      "pass",
    ]);
    assert.equal(calibratePassExpectation.status, 2, "calibrate with expect pass: exit code");
    assert.equal(
      calibratePassExpectation.report.verdict,
      "blocked",
      "calibrate with expect pass: verdict",
    );
    assert.match(String(calibratePassExpectation.report.error), /--expect must be fail/);
  });
});
