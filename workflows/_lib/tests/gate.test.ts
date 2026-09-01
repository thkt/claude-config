/// <reference types="node" />
// Behavior tests for workflows/_lib/gate.ts. gate.py and the differential suite that
// cross-checked it are retired now that code.js's gate path runs gate.ts directly.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  MAX_CALIBRATION_CANDIDATES,
  MAX_CALIBRATION_LINE_LENGTH,
  calibrationCandidates,
  classifyObservation,
  hasExactOutputLine,
  parseArgs,
  tail,
} from "../gate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const TS_SCRIPT = join(HERE, "..", "gate.ts");

// Imported directly rather than spawned: tsconfig's allowImportingTsExtensions makes this
// specifier one tsc accepts, and Node resolves the same one under type stripping.

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

test("T-010 an unknown flag, a repeated singleton, a relative cwd, and an anchorless expect fail all report blocked with usage_error", () => {
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

test("T-012 an anchor matching no complete line fails as missing_required_output and forbidden output fails as forbidden_output", () => {
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

// A live code run trimmed the relay tail to 800 bytes while a TAP reporter printed its `not ok`
// lines first, so the calibration found no candidate and the sealed line failed the official run.
test("a planned failure line outside the report tail is still a calibration candidate and a matching anchor", () => {
  withTempDir((cwd) => {
    const filler = "x".repeat(400);
    const command = `printf 'not ok 1 - T-001 x\\n%s\\n%s\\n' ${filler} ${filler}; exit 1`;
    const calibrated = runCli([
      "--cwd",
      cwd,
      "--command",
      command,
      "--calibrate",
      "--planned-test",
      "T-001:T-001 x",
      "--tail-bytes",
      "100",
    ]);
    assert.equal(calibrated.report.verdict, "pass", "calibration: verdict");
    const candidates = calibrated.report.candidates as { text: string }[];
    assert.deepEqual(
      candidates.map((c) => c.text),
      ["not ok 1 - T-001 x"],
      "the line beyond the tail is offered",
    );
    assert.doesNotMatch(
      String((calibrated.report.evidence as { stdout_tail: string }).stdout_tail),
      /not ok/,
      "the report tail itself still leaves the line out",
    );

    const official = runCli([
      "--cwd",
      cwd,
      "--command",
      command,
      "--expect",
      "fail",
      "--require-output",
      "not ok 1 - T-001 x",
      "--tail-bytes",
      "100",
    ]);
    assert.equal(
      official.report.verdict,
      "pass",
      "official run: the anchor matches beyond the tail",
    );
  });
});

test("T-013 calibrate runs without an anchor, prefixes its classification, and refuses an anchor or an expect pass", () => {
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

// The three paths below were the differential suite's reason for existing: each one reads
// differently in Node than in the Python the gate was ported from, and none of them shows up in
// a test that only exercises the verdict on a command that ran to completion.
test("T-018 a command that outruns its timeout reports blocked with exit 124", () => {
  withTempDir((cwd) => {
    const run = runCli([
      "--cwd",
      cwd,
      "--command",
      "sleep 5",
      "--expect",
      "pass",
      "--timeout-ms",
      "200",
    ]);
    assert.equal(run.status, 124, "timeout: exit code");
    assert.equal(run.report.verdict, "blocked", "timeout: verdict");
    assert.deepEqual(run.report.reason_codes, ["timeout"]);
    const evidence = run.report.evidence as Record<string, unknown>;
    assert.equal(evidence.timed_out, true, "timeout: timed_out");
    assert.equal(evidence.exit_code, null, "timeout: no exit code");
  });
});

test("T-019 a command killed by a signal reports blocked with the negative exit code", () => {
  withTempDir((cwd) => {
    const run = runCli(["--cwd", cwd, "--command", "kill -TERM $$", "--expect", "pass"]);
    assert.equal(run.status, 2, "signal: exit code");
    assert.equal(run.report.verdict, "blocked", "signal: verdict");
    assert.deepEqual(run.report.reason_codes, ["signal"]);
    const evidence = run.report.evidence as Record<string, unknown>;
    assert.equal(evidence.signal, "SIGTERM", "signal: name");
    assert.equal(evidence.exit_code, -15, "signal: negative exit code");
  });
});

// Node's spawnSync stops at a 1 MiB default buffer and reports ENOBUFS with SIGTERM, which a
// naive port classifies as a killed command. A test suite is exactly the command that exceeds it.
test("T-020 a command emitting more than 1 MiB still reports its own verdict", () => {
  withTempDir((cwd) => {
    const run = runCli([
      "--cwd",
      cwd,
      "--command",
      "yes hello | head -c 2000000",
      "--expect",
      "pass",
    ]);
    assert.equal(run.status, 0, "large output: exit code");
    assert.equal(run.report.verdict, "pass", "large output: verdict");
    const evidence = run.report.evidence as Record<string, unknown>;
    assert.equal(evidence.timed_out, false, "large output: not a timeout");
    assert.equal(evidence.signal, null, "large output: no signal");
  });
});

test("T-021 the tail keeps a complete first line and drops one the cut left partial", () => {
  withTempDir((cwd) => {
    const complete = runCli([
      "--cwd",
      cwd,
      "--command",
      String.raw`printf 'alpha\nbeta\n'`,
      "--expect",
      "pass",
      "--tail-bytes",
      "5",
    ]);
    assert.equal((complete.report.evidence as Record<string, unknown>).stdout_tail, "beta\n");
    const partial = runCli([
      "--cwd",
      cwd,
      "--command",
      String.raw`printf 'alpha\nbeta\n'`,
      "--expect",
      "pass",
      "--tail-bytes",
      "8",
    ]);
    assert.equal((partial.report.evidence as Record<string, unknown>).stdout_tail, "beta\n");
    const none = runCli([
      "--cwd",
      cwd,
      "--command",
      String.raw`printf 'alphabeta'`,
      "--expect",
      "pass",
      "--tail-bytes",
      "4",
    ]);
    assert.equal((none.report.evidence as Record<string, unknown>).stdout_tail, "");
  });
});

// Candidate selection is what keeps a caller from sealing a line it typed. Without these, a
// calibration could offer the wrong lines and the suite would still be green.
test("T-022 a calibration offers only lines naming a planned test beside a failure marker", () => {
  withTempDir((cwd) => {
    const named = runCli([
      "--cwd",
      cwd,
      "--command",
      String.raw`printf 'ok 1 - other\nnot ok 2 - an empty query returns an error\n'; exit 1`,
      "--calibrate",
      "--planned-test",
      "T-001:an empty query returns an error",
    ]);
    assert.equal(named.status, 0, "named: exit code");
    const candidates = named.report.candidates as Array<Record<string, unknown>>;
    assert.equal(candidates.length, 1, "named: one candidate");
    assert.equal(candidates[0].text, "not ok 2 - an empty query returns an error");
    assert.equal(candidates[0].test_id, "T-001");

    const passed = runCli([
      "--cwd",
      cwd,
      "--command",
      String.raw`printf 'ok 1 - an empty query returns an error\nnot ok 2 - unrelated\n'; exit 1`,
      "--calibrate",
      "--planned-test",
      "T-001:an empty query returns an error",
    ]);
    assert.equal(passed.status, 1, "planned test passed: exit code");
    assert.equal(passed.report.classification, "calibration_missing_calibration_evidence");
    assert.deepEqual(passed.report.candidates, []);
  });
});

test("T-023 a planned name carrying a failure word does not satisfy the marker by itself", () => {
  withTempDir((cwd) => {
    const run = runCli([
      "--cwd",
      cwd,
      "--command",
      String.raw`printf 'ok 1 - ERROR handling works\n'; exit 1`,
      "--calibrate",
      "--planned-test",
      "T-001:ERROR handling works",
    ]);
    assert.equal(run.status, 1, "self-satisfying name: exit code");
    assert.deepEqual(run.report.candidates, [], "the name alone is not a failure marker");
  });
});

test("T-024 a calibration with no planned test falls back to marker lines", () => {
  withTempDir((cwd) => {
    const run = runCli([
      "--cwd",
      cwd,
      "--command",
      String.raw`printf 'ok 1 - fine\nnot ok 2 - broken\n'; exit 1`,
      "--calibrate",
    ]);
    assert.equal(run.status, 0, "fallback: exit code");
    const candidates = run.report.candidates as Array<Record<string, unknown>>;
    assert.deepEqual(
      candidates.map((c) => c.text),
      ["not ok 2 - broken"],
    );
  });
});

test("T-025 a planned test outside a calibration run is a usage error", () => {
  withTempDir((cwd) => {
    const run = runCli([
      "--cwd",
      cwd,
      "--command",
      "true",
      "--expect",
      "pass",
      "--planned-test",
      "T-001:x",
    ]);
    assert.equal(run.status, 2, "planned test without calibrate: exit code");
    assert.match(String(run.report.error), /only narrows a --calibrate run/);
  });
});

// Reached through a symlinked directory, a main guard comparing argv[1] to the resolved module
// path never fires: the CLI exits 0 having printed nothing, and every caller reads that as an
// unparseable report. macOS hands out /var/... for /private/var/..., so a temp dir is enough.
test("T-026 the CLI reports through a symlinked path to its own file", () => {
  withTempDir((cwd) => {
    const link = join(cwd, "gate-link.ts");
    symlinkSync(TS_SCRIPT, link);
    const result = spawnSync(
      process.execPath,
      [link, "--cwd", cwd, "--command", "true", "--expect", "pass"],
      {
        encoding: "utf8",
      },
    );
    assert.notEqual(result.stdout.trim(), "", "the CLI printed a report through the symlink");
    assert.equal(JSON.parse(result.stdout).verdict, "pass");
  });
});

// The cases below reach the helpers directly. Under the CLI-only surface they were unreachable
// in process, so the port dropped them; each one guards a branch a spawned run cannot single out.
test("T-027 tail keeps a complete line, drops a partial one, and survives a split UTF-8 sequence", () => {
  assert.equal(tail(Buffer.from("alpha\nbeta\n"), 100), "alpha\nbeta\n");
  assert.equal(tail(Buffer.from("alpha\nbeta\n"), 5), "beta\n");
  assert.equal(tail(Buffer.from("alpha\nbeta\n"), 8), "beta\n");
  assert.equal(tail(Buffer.from("alphabeta"), 4), "");
  assert.equal(tail(Buffer.from("alpha\rbeta"), 8), "beta");
  // The cut lands inside a 3-byte character, so the tail starts after the newline.
  const multibyte = Buffer.from("あいう\nおわり\n");
  assert.equal(tail(multibyte, multibyte.length - 2), "おわり\n");
});

test("T-028 hasExactOutputLine matches a whole line and rejects a substring of one", () => {
  const line = "not ok 1 - T-001 x";
  assert.equal(hasExactOutputLine(`${line}\n`, "", line), true);
  assert.equal(hasExactOutputLine(`${line}\n`, "", "T-001 x"), false);
  assert.equal(hasExactOutputLine("", "FAILED tests/a.py::t", "FAILED tests/a.py::t"), true);
  assert.equal(hasExactOutputLine("a\nb\n", "", "a\nb"), false);
  assert.equal(hasExactOutputLine("\n\n", "", ""), false);
});

test("T-029 the gate id and failure route shapes are enforced", () => {
  const base = ["--command", "true", "--expect", "pass", "--cwd", "/"];
  assert.throws(() => parseArgs([...base, "--gate-id", "-leading-dash"]), /--gate-id/);
  assert.throws(() => parseArgs([...base, "--gate-id", "a".repeat(129)]), /--gate-id/);
  assert.throws(() => parseArgs([...base, "--failure-route", "sideways"]), /--failure-route/);
  assert.equal(parseArgs([...base, "--failure-route", "red:U-001"]).failure_route, "red:U-001");
  assert.equal(parseArgs([...base, "--failure-route", "cleanup:x"]).failure_route, "cleanup:x");
});

test("T-030 a missing value, a missing cwd, and a repeated calibrate are usage errors", () => {
  assert.throws(() => parseArgs(["--command"]), /missing value/);
  assert.throws(() => parseArgs(["--command", "true", "--expect", "pass"]), /--cwd is required/);
  assert.throws(
    () => parseArgs(["--command", "true", "--cwd", "/", "--calibrate", "--calibrate"]),
    /only once/,
  );
  assert.throws(
    () =>
      parseArgs(["--command", "true", "--cwd", "/", "--calibrate", "--planned-test", "no-colon"]),
    /<test-id>:<test name>/,
  );
});

test("T-031 the calibration caps are the ones the candidate extraction applies", () => {
  const many = Array.from({ length: MAX_CALIBRATION_CANDIDATES + 40 }, (_, i) => `not ok ${i} - x`);
  assert.equal(calibrationCandidates(many.join("\n"), "", null).length, MAX_CALIBRATION_CANDIDATES);
  const long = `not ok 1 - ${"y".repeat(MAX_CALIBRATION_LINE_LENGTH)}`;
  assert.deepEqual(calibrationCandidates(long, "", null), []);
});

test("T-032 every verdict branch is reachable from an observation alone", () => {
  const options = parseArgs(["--command", "true", "--cwd", "/", "--expect", "pass"]);
  const base = {
    timedOut: false,
    executionError: null,
    returncode: 0,
    signalName: null,
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    durationMs: 1,
  };
  const [passCode, passReport] = classifyObservation(options, base);
  assert.equal(passCode, 0);
  assert.equal(passReport.verdict, "pass");

  const [failCode, failReport] = classifyObservation(options, { ...base, returncode: 3 });
  assert.equal(failCode, 1);
  assert.deepEqual(failReport.reason_codes, ["unexpected_failure"]);

  const [execCode, execReport] = classifyObservation(options, {
    ...base,
    returncode: null,
    executionError: "spawn failed",
  });
  assert.equal(execCode, 2);
  assert.deepEqual(execReport.reason_codes, ["execution_error"]);

  const redOptions = parseArgs(["--command", "x", "--cwd", "/", "--calibrate"]);
  const [calCode, calReport] = classifyObservation(redOptions, {
    ...base,
    returncode: 0,
    stdout: Buffer.from("ok 1 - all green\n"),
  });
  assert.equal(calCode, 1);
  assert.equal(calReport.classification, "calibration_unexpected_pass");
});

// The plan's sentence reaches the gate through the repository's Markdown formatter, which puts
// spaces around an ASCII digit run in Japanese prose. The same sentence written into a test name
// carries none, and an exact comparison then leaves the run with no candidate to seal at all.
test("T-033 a planned name the formatter respaced still names its failure, and an absent one does not", () => {
  const name = "追跡 `.py` すべてが 1 行目に持つ";
  const line =
    "test_T_001 (__main__.Shebang.test_T_001)\nT-001 追跡 `.py` すべてが1行目に持つ ... FAIL";
  const [first, second] = line.split("\n");
  assert.deepEqual(
    calibrationCandidates("", `${first}\n${second}\n`, [["T-001", name]]).map((c) => c.text),
    [second],
  );
  assert.deepEqual(calibrationCandidates("", `${second}\n`, [["T-002", "別の名前"]]), []);
});

// unittest's verbose reporter puts its verdict at the end of the line, so a marker set that only
// looks for FAIL at the head of a line reads a failing Python suite as offering nothing.
test("T-034 a trailing unittest verdict counts as a failure marker and a passing one does not", () => {
  const planned: [string, string][] = [["T-001", "シェバンを持つ"]];
  const fail = "T-001 シェバンを持つ ... FAIL";
  const error = "T-001 シェバンを持つ ... ERROR";
  const ok = "T-001 シェバンを持つ ... ok";
  assert.deepEqual(
    calibrationCandidates("", `${fail}\n${error}\n${ok}\n`, planned).map((c) => c.text),
    [fail, error],
  );
});
