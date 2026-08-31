#!/usr/bin/env node
/// <reference types="node" />
// Usage: gate.ts --command CMD --cwd DIR --expect pass|fail [options]
//
// shell コマンドを 1 つ実行し、その結果を決定論的な gate report として報告する。
// 判定は終了ステータスと出力のリテラル照合から計算し、model には判断させない。
// 「テストが通ったか」を必要とする workflow stage は、agent に boolean を尋ねる
// 代わりにこれを呼ぶ。
//
// options:
//   --gate-id ID            report に載せる識別子 (default: gate)
//   --failure-route ROUTE   fail 判定の戻り先 (default: triage)
//   --timeout-ms N          コマンドのタイムアウト、ミリ秒 (default: 600000)
//   --tail-bytes N          report に残す stdout/stderr のバイト数 (default: 12000)
//   --require-output LINE   繰り返し可。LINE は出力の完全な 1 行と一致すること
//   --forbid-output TEXT    繰り返し可。TEXT が出力のどこにも現れないこと
//   --calibrate             Red コマンドを実行し、その失敗出力を得る
//   --planned-test ID:NAME  繰り返し可。calibration の候補を、その計画テスト名を含み
//                           かつ失敗マーカーを伴う行だけに絞る
//
// `--expect fail` は `--require-output` アンカーを 1 つ以上要求する。「コマンドが
// 失敗した」だけでは、意図した理由で失敗したことを立証できない。唯一の例外が
// `--calibrate` である。アンカーの選択元になる出力を生む実行そのものだからである。
// `--expect fail` を強制し、アンカーを拒否し、classification に `calibration_` を付ける。
//
// calibration の report は `candidates` を持つ。呼び出し側が seal してよい行の集合で、
// 各行に id が付く。行そのものを返させず、この集合から選ばせることが、削ったり作ったり
// した行を seal させない仕組みになる。
//
// stdout: gate report の JSON オブジェクト 1 件 (REPORT_PROTOCOL を参照)。
// exit は 0 が pass、1 が fail、2 が blocked と usage error、124 が timeout。判定は
// 終了コードだけでなく JSON から読む。fail-closed: usage error は blocked 判定であり、
// pass にはならない。
//
// Contract: workflows/_lib/gate.py 自身の docstring と挙動を、そのまま TypeScript へ
// 移したもの (differential coverage: workflows/_lib/tests/gate.differential.test.ts)。
//
// tsconfig.json は `types` 配列を宣言しておらず、TypeScript 7 の `moduleResolution:
// "bundler"` はそれが無いと @types/node を自動では含めない。上の
// `/// <reference types="node" />` は、tsconfig.json を編集する代わりにその隙間を
// この unit のファイル範囲外に留めている。tsconfig.json は別の unit が持つ。
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export const REPORT_PROTOCOL = "claude-code-gate/v1";
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_TAIL_BYTES = 12_000;

const SINGLE_FLAGS = new Set([
  "--gate-id",
  "--failure-route",
  "--cwd",
  "--expect",
  "--command",
  "--timeout-ms",
  "--tail-bytes",
]);
const REPEATABLE_FLAGS = new Set(["--require-output", "--forbid-output", "--planned-test"]);
const BOOLEAN_FLAGS = new Set(["--calibrate"]);
const GATE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ROUTE_PATTERN =
  /^(?:blocked|triage|(?:red|green|direct):[A-Za-z0-9][A-Za-z0-9._-]*|cleanup:[A-Za-z0-9][A-Za-z0-9._-]*)$/;
const LINE_SPLIT = /\r\n|\r|\n/;
const MAX_CALIBRATION_CANDIDATES = 128;
const MAX_CALIBRATION_LINE_LENGTH = 2000;
const FAILURE_MARKER =
  /(?:^\s*not ok\b|^\s*(?:FAIL(?:ED|URE)?\b|ERROR\b|\(fail\)|[✖✕×✗❌●])|^\s*\d+\)\s+|\bFAILED\b|\bFAILURE\b)/i;
const LF = 0x0a;
const CR = 0x0d;

// blocked 判定として報告し、pass にはしない。
class UsageError extends Error {}

interface ParsedOptions {
  gate_id: string;
  failure_route: string;
  timeout_ms: number;
  tail_bytes: number;
  required_output: string[];
  forbidden_output: string[];
  planned_tests: string[];
  calibrate: boolean;
  cwd?: string;
  expect?: string;
  command?: string;
}

interface ValidatedOptions {
  gate_id: string;
  failure_route: string;
  timeout_ms: number;
  tail_bytes: number;
  required_output: string[];
  forbidden_output: string[];
  planned_tests: string[];
  calibrate: boolean;
  cwd: string;
  expect: "pass" | "fail";
  command: string;
}

interface CandidateLine {
  id: string;
  stream: "stdout" | "stderr";
  text: string;
  test_id?: string;
}

interface CheckResult {
  kind: "exit" | "output_includes" | "output_excludes";
  expected?: string;
  actual?: number | null;
  signal?: string | null;
  value?: string;
  passed: boolean;
}

interface GateReport {
  protocol: string;
  gate_id: string;
  verdict: string;
  classification: string;
  reason_codes: string[];
  failure_route: string | null;
  configured_failure_route: string;
  command: string;
  cwd: string;
  expected: string;
  duration_ms: number;
  candidates: CandidateLine[];
  evidence: {
    kind: "shell";
    checks: CheckResult[];
    matches_expected_exit: boolean;
    exit_code: number | null;
    signal: string | null;
    timed_out: boolean;
    execution_error: string | null;
    stdout_tail: string;
    stderr_tail: string;
  };
}

interface BlockedReport {
  protocol: string;
  gate_id: null;
  verdict: "blocked";
  classification: "usage_error" | "execution_error";
  reason_codes: string[];
  failure_route: "blocked";
  configured_failure_route: null;
  error: string;
}

// 切り口の先頭行を報告すると、完全な行のどれとも一致しないアンカーを差し出すことになる。
function tail(data: Buffer, maxBytes: number): string {
  const start = Math.max(0, data.length - maxBytes);
  if (start === 0 || data[start - 1] === LF || data[start - 1] === CR) {
    return data.subarray(start).toString("utf8");
  }
  const ends = [data.indexOf(LF, start), data.indexOf(CR, start)].filter((index) => index >= 0);
  if (ends.length === 0) {
    return "";
  }
  const lineEnd = Math.min(...ends);
  let nextLine = lineEnd + 1;
  if (data[lineEnd] === CR && nextLine < data.length && data[nextLine] === LF) {
    nextLine += 1;
  }
  return data.subarray(nextLine).toString("utf8");
}

// 包含にすると、成功行にも含まれる素のテスト名を受理してしまう。
function hasExactOutputLine(stdout: string, stderr: string, evidence: string): boolean {
  if (!evidence || evidence.includes("\r") || evidence.includes("\n")) {
    return false;
  }
  return [stdout, stderr].some((text) => text.split(LINE_SPLIT).includes(evidence));
}

// 1 つの stream の各行に id を振る。呼び出し側が行を打ち直さずに指名できるようにする。
function outputLines(stream: "stdout" | "stderr", text: string): CandidateLine[] {
  const lines: CandidateLine[] = [];
  const raws = text.split(LINE_SPLIT);
  for (let index = 0; index < raws.length; index += 1) {
    const raw = raws[index];
    if (!raw.trim() || raw.length > MAX_CALIBRATION_LINE_LENGTH) {
      continue;
    }
    lines.push({ id: `${stream}:${index + 1}`, stream, text: raw });
  }
  return lines;
}

// 計画テスト名を含み、その名前を除いた残りに失敗マーカーがある行。
//
// マーカーを探す前に名前を切り落とす。そうしないと、名前自体に "error" を含むテストが
// 名前の力だけでマーカーを満たしてしまう。
function namesPlannedFailure(line: string, name: string): boolean {
  const at = line.indexOf(name);
  if (at < 0) {
    return false;
  }
  const context = line.slice(0, at) + line.slice(at + name.length);
  return FAILURE_MARKER.test(context);
}

// 呼び出し側が seal してよい行。固定された集合から選ばせることが、打ち直した行や
// 削った行や作った行を返させない仕組みになる。
function calibrationCandidates(
  stdout: string,
  stderr: string,
  planned: [string, string][] | null,
): CandidateLine[] {
  const lines = [...outputLines("stdout", stdout), ...outputLines("stderr", stderr)];
  if (planned === null) {
    const marked = lines.filter((line) => FAILURE_MARKER.test(line.text));
    const pool = marked.length > 0 ? marked : lines;
    return pool.slice(-MAX_CALIBRATION_CANDIDATES);
  }
  const candidates: CandidateLine[] = [];
  const seen = new Set<string>();
  for (const [testId, name] of planned) {
    for (const line of lines) {
      if (
        candidates.length >= MAX_CALIBRATION_CANDIDATES ||
        seen.has(line.id) ||
        !namesPlannedFailure(line.text, name)
      ) {
        continue;
      }
      candidates.push({ ...line, test_id: testId });
      seen.add(line.id);
    }
  }
  return candidates;
}

function positiveInt(value: string, flag: string): number {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!/^[+-]?\d+$/.test(trimmed) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new UsageError(`${flag} must be a positive integer`);
  }
  return parsed;
}

function isExistingDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]): ValidatedOptions {
  const options: ParsedOptions = {
    gate_id: "gate",
    failure_route: "triage",
    timeout_ms: DEFAULT_TIMEOUT_MS,
    tail_bytes: DEFAULT_TAIL_BYTES,
    required_output: [],
    forbidden_output: [],
    planned_tests: [],
    calibrate: false,
  };
  const seen = new Set<string>();
  let index = 0;
  while (index < argv.length) {
    const flag = argv[index];
    if (BOOLEAN_FLAGS.has(flag)) {
      if (seen.has(flag)) {
        throw new UsageError(`${flag} may be provided only once`);
      }
      options.calibrate = true;
      seen.add(flag);
      index += 1;
      continue;
    }
    if (!SINGLE_FLAGS.has(flag) && !REPEATABLE_FLAGS.has(flag)) {
      throw new UsageError(`unknown argument: ${flag}`);
    }
    if (index + 1 >= argv.length) {
      throw new UsageError(`missing value for ${flag}`);
    }
    const value = argv[index + 1];
    if (SINGLE_FLAGS.has(flag) && seen.has(flag)) {
      throw new UsageError(`${flag} may be provided only once`);
    }
    if (!value) {
      throw new UsageError(`${flag} must not be empty`);
    }
    switch (flag) {
      case "--gate-id":
        options.gate_id = value;
        break;
      case "--failure-route":
        options.failure_route = value;
        break;
      case "--cwd":
        options.cwd = value;
        break;
      case "--expect":
        options.expect = value;
        break;
      case "--command":
        options.command = value;
        break;
      case "--timeout-ms":
        options.timeout_ms = positiveInt(value, flag);
        break;
      case "--tail-bytes":
        options.tail_bytes = positiveInt(value, flag);
        break;
      case "--require-output":
        options.required_output.push(value);
        break;
      case "--forbid-output":
        options.forbidden_output.push(value);
        break;
      case "--planned-test":
        if (!value.includes(":")) {
          throw new UsageError("--planned-test must be <test-id>:<test name>");
        }
        options.planned_tests.push(value);
        break;
      default:
        throw new UsageError(`unknown argument: ${flag}`);
    }
    seen.add(flag);
    index += 2;
  }

  if (!GATE_ID_PATTERN.test(options.gate_id) || options.gate_id.length > 128) {
    throw new UsageError("--gate-id has an invalid shape");
  }
  if (!ROUTE_PATTERN.test(options.failure_route)) {
    throw new UsageError(
      "--failure-route must be blocked, triage, red:<unit>, green:<unit>, " +
        "direct:<unit>, or cleanup:<name>",
    );
  }
  if (!options.cwd) {
    throw new UsageError("--cwd is required");
  }
  if (!isAbsolute(options.cwd)) {
    throw new UsageError("--cwd must be absolute");
  }
  if (!isExistingDirectory(options.cwd)) {
    throw new UsageError("--cwd must be an existing directory");
  }
  if (options.calibrate) {
    if (options.expect !== undefined && options.expect !== "fail") {
      throw new UsageError("--calibrate runs the Red command, so --expect must be fail");
    }
    options.expect = "fail";
    if (options.required_output.length > 0) {
      throw new UsageError("--calibrate discovers the anchor, so it takes no --require-output");
    }
  } else if (options.planned_tests.length > 0) {
    throw new UsageError("--planned-test only narrows a --calibrate run");
  }
  if (options.expect !== "pass" && options.expect !== "fail") {
    throw new UsageError("--expect must be pass or fail");
  }
  if (!options.command || !options.command.trim()) {
    throw new UsageError("--command is required");
  }
  if (options.expect === "fail" && !options.calibrate && options.required_output.length === 0) {
    throw new UsageError("--expect fail requires at least one --require-output anchor");
  }
  return {
    ...options,
    cwd: options.cwd,
    expect: options.expect,
    command: options.command,
  };
}

function signalNumber(name: string): number | undefined {
  return (osConstants.signals as unknown as Record<string, number>)[name];
}

function runGate(options: ValidatedOptions): [number, GateReport] {
  const { command, expect } = options;
  const startedAt = process.hrtime.bigint();
  let timedOut = false;
  let executionError: string | null = null;
  let returncode: number | null = null;
  let signalName: string | null = null;
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);

  const result = spawnSync("/bin/zsh", ["-c", command], {
    cwd: options.cwd,
    timeout: options.timeout_ms,
    maxBuffer: Infinity,
  });

  if (result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    timedOut = true;
    stdout = result.stdout ?? Buffer.alloc(0);
    stderr = result.stderr ?? Buffer.alloc(0);
  } else if (result.error) {
    executionError = result.error.message;
  } else if (result.signal !== null) {
    signalName = result.signal;
    const number = signalNumber(signalName);
    returncode = number === undefined ? null : -number;
    stdout = result.stdout ?? Buffer.alloc(0);
    stderr = result.stderr ?? Buffer.alloc(0);
  } else {
    returncode = result.status;
    stdout = result.stdout ?? Buffer.alloc(0);
    stderr = result.stderr ?? Buffer.alloc(0);
  }

  const durationMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);

  const stdoutTail = tail(stdout, options.tail_bytes);
  const stderrTail = tail(stderr, options.tail_bytes);
  const combined = `${stdoutTail}\n${stderrTail}`;
  const commandPassed = returncode === 0;
  const commandFailed = returncode !== null && returncode > 0;
  const matchesExpectedExit = expect === "pass" ? commandPassed : commandFailed;

  const checks: CheckResult[] = [
    {
      kind: "exit",
      expected: expect,
      actual: returncode,
      signal: signalName,
      passed: matchesExpectedExit,
    },
  ];
  for (const value of options.required_output) {
    checks.push({
      kind: "output_includes",
      value,
      passed: hasExactOutputLine(stdoutTail, stderrTail, value),
    });
  }
  for (const value of options.forbidden_output) {
    checks.push({ kind: "output_excludes", value, passed: !combined.includes(value) });
  }

  const reasonCodes: string[] = [];
  let verdict: string;
  let exitCode: number;
  if (timedOut) {
    verdict = "blocked";
    exitCode = 124;
    reasonCodes.push("timeout");
  } else if (executionError !== null) {
    verdict = "blocked";
    exitCode = 2;
    reasonCodes.push("execution_error");
  } else if (signalName !== null) {
    verdict = "blocked";
    exitCode = 2;
    reasonCodes.push("signal");
  } else {
    if (!matchesExpectedExit) {
      reasonCodes.push(expect === "fail" ? "unexpected_pass" : "unexpected_failure");
    }
    if (checks.some((check) => check.kind === "output_includes" && !check.passed)) {
      reasonCodes.push("missing_required_output");
    }
    if (checks.some((check) => check.kind === "output_excludes" && !check.passed)) {
      reasonCodes.push("forbidden_output");
    }
    verdict = reasonCodes.length > 0 ? "fail" : "pass";
    exitCode = reasonCodes.length > 0 ? 1 : 0;
  }

  const defaultClassification = expect === "fail" ? "expected_failure" : "pass";
  let classification = reasonCodes.length > 0 ? reasonCodes[0] : defaultClassification;
  let candidates: CandidateLine[] = [];
  if (options.calibrate) {
    const planned: [string, string][] | null =
      options.planned_tests.length > 0
        ? options.planned_tests.map((entry): [string, string] => {
            const separator = entry.indexOf(":");
            return [entry.slice(0, separator), entry.slice(separator + 1)];
          })
        : null;
    candidates = calibrationCandidates(stdoutTail, stderrTail, planned);
    // コマンドが失敗することと、計画したシナリオが失敗することは別である。それを名指す
    // 行が 1 本も無ければ、アンカーを seal する対象が存在しない。
    if (verdict === "pass" && candidates.length === 0) {
      verdict = "fail";
      exitCode = 1;
      reasonCodes.length = 0;
      reasonCodes.push("missing_calibration_evidence");
      classification = "missing_calibration_evidence";
    }
    classification = `calibration_${classification}`;
  }

  let failureRoute: string | null = null;
  if (verdict === "blocked") {
    failureRoute = "blocked";
  } else if (verdict === "fail") {
    failureRoute = options.failure_route;
  }

  const report: GateReport = {
    protocol: REPORT_PROTOCOL,
    gate_id: options.gate_id,
    verdict,
    classification,
    reason_codes: reasonCodes,
    failure_route: failureRoute,
    configured_failure_route: options.failure_route,
    command,
    cwd: options.cwd,
    expected: expect,
    duration_ms: durationMs,
    candidates,
    evidence: {
      kind: "shell",
      checks,
      matches_expected_exit: matchesExpectedExit,
      exit_code: returncode,
      signal: signalName,
      timed_out: timedOut,
      execution_error: executionError,
      stdout_tail: stdoutTail,
      stderr_tail: stderrTail,
    },
  };
  return [exitCode, report];
}

function blockedReport(error: unknown): BlockedReport {
  const usage = error instanceof UsageError;
  return {
    protocol: REPORT_PROTOCOL,
    gate_id: null,
    verdict: "blocked",
    classification: usage ? "usage_error" : "execution_error",
    reason_codes: [usage ? "usage_error" : "execution_error"],
    failure_route: "blocked",
    configured_failure_route: null,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function main(argv: string[]): number {
  let exitCode: number;
  let report: GateReport | BlockedReport;
  try {
    [exitCode, report] = runGate(parseArgs(argv));
  } catch (error) {
    process.stdout.write(`${JSON.stringify(blockedReport(error), null, 2)}\n`);
    return 2;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
