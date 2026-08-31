#!/usr/bin/env node
/// <reference types="node" />
// Usage: gate.ts --command CMD --cwd DIR --expect pass|fail [options]
//
// Run one shell command and report the outcome as a deterministic gate report. The
// verdict is computed from the exit status and from literal output matching, never
// judged by a model. A workflow stage that needs "did the tests pass" invokes this
// instead of asking an agent for a boolean.
//
// options:
//   --gate-id ID            identifier echoed into the report (default: gate)
//   --failure-route ROUTE   where a fail verdict routes (default: triage)
//   --timeout-ms N          command timeout in milliseconds (default: 600000)
//   --tail-bytes N          bytes of stdout/stderr kept in the report (default: 12000)
//   --require-output LINE   repeatable; LINE must equal one complete output line
//   --forbid-output TEXT    repeatable; TEXT must not occur anywhere in the output
//   --calibrate             run the Red command to discover its failure output
//   --planned-test ID:NAME  repeatable; narrows the calibration candidates to lines
//                           naming that planned test beside a failure marker
//
// `--expect fail` requires at least one `--require-output` anchor: "the command
// failed" alone does not establish that it failed for the intended reason.
// `--calibrate` is the one exception, because it is the run that produces the
// output an anchor is later chosen from. It forces `--expect fail`, refuses an
// anchor, and prefixes its classification with `calibration_`.
//
// A calibration report carries `candidates`: the lines a caller may seal on, each with
// an id. Selecting from that set rather than returning a line is what keeps a caller
// from sealing on a line it trimmed or invented.
//
// stdout: one gate report JSON object (see REPORT_PROTOCOL).
// exit 0 pass, 1 fail, 2 blocked or usage error, 124 timeout. Read the verdict from
// the JSON rather than from the exit code alone -- fail-closed: a usage error is a
// blocked verdict, never a pass.
//
// Contract: this CLI's own behavior, exercised end to end by workflows/_lib/tests/gate.test.ts.
//
// tsconfig.json declares no `types` array, and TypeScript 7's `moduleResolution: "bundler"`
// does not auto-include @types/node without one. The `/// <reference types="node" />`
// above keeps that gap out of this unit's file scope instead of editing tsconfig.json,
// which is owned elsewhere.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { isAbsolute } from "node:path";
import { isMainModule } from "./entry-point.ts";

export const REPORT_PROTOCOL = "claude-code-gate/v1";
export const DEFAULT_TIMEOUT_MS = 600_000;
export const DEFAULT_TAIL_BYTES = 12_000;

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
export const GATE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ROUTE_PATTERN =
  /^(?:blocked|triage|(?:red|green|direct):[A-Za-z0-9][A-Za-z0-9._-]*|cleanup:[A-Za-z0-9][A-Za-z0-9._-]*)$/;
const LINE_SPLIT = /\r\n|\r|\n/;
export const MAX_CALIBRATION_CANDIDATES = 128;
export const MAX_CALIBRATION_LINE_LENGTH = 2000;
const FAILURE_MARKER =
  /(?:^\s*not ok\b|^\s*(?:FAIL(?:ED|URE)?\b|ERROR\b|\(fail\)|[✖✕×✗❌●])|^\s*\d+\)\s+|\bFAILED\b|\bFAILURE\b|\.{3}\s*(?:FAIL|ERROR)\s*$)/i;
const LF = 0x0a;
const CR = 0x0d;

// Reported as a blocked verdict, never as a pass.
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

// Reporting the cut's first line would offer an anchor no complete line equals.
export function tail(data: Buffer, maxBytes: number): string {
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

// Containment would accept a bare test name, which the passing line carries too.
export function hasExactOutputLine(stdout: string, stderr: string, evidence: string): boolean {
  if (!evidence || evidence.includes("\r") || evidence.includes("\n")) {
    return false;
  }
  return [stdout, stderr].some((text) => text.split(LINE_SPLIT).includes(evidence));
}

// Every line of one stream, addressed so a caller can name one without retyping it.
export function outputLines(stream: "stdout" | "stderr", text: string): CandidateLine[] {
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

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

// Where the planned name sits in the line, with each run of whitespace inside the name
// allowed to be absent from the line.
//
// Not an exact comparison: the plan's sentence reaches here through the repository's
// Markdown formatter, which spaces an ASCII digit run apart from the Japanese around it,
// while the same sentence written into a test name carries no such space. An exact
// comparison then offers no candidate at all and the run stops with nothing to seal.
function locateName(line: string, name: string): { at: number; length: number } | null {
  const at = line.indexOf(name);
  if (at >= 0) {
    return { at, length: name.length };
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const pattern = parts.map((part) => part.replace(REGEX_META, "\\$&")).join("\\s*");
  const match = new RegExp(pattern).exec(line);
  return match === null ? null : { at: match.index, length: match[0].length };
}

// A line naming the planned test and, outside that name, carrying a failure marker.
//
// The name is cut out before the marker is looked for. A test whose own name contains
// "error" would otherwise satisfy the marker on the strength of its name alone.
export function namesPlannedFailure(line: string, name: string): boolean {
  const found = locateName(line, name);
  if (found === null) {
    return false;
  }
  const context = line.slice(0, found.at) + line.slice(found.at + found.length);
  return FAILURE_MARKER.test(context);
}

// Lines a caller may seal on. Selecting from a fixed set is what keeps the caller
// from handing back a line it typed, trimmed, or invented.
export function calibrationCandidates(
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

export function positiveInt(value: string, flag: string): number {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!/^[+-]?\d+$/.test(trimmed) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new UsageError(`${flag} must be a positive integer`);
  }
  return parsed;
}

/** A stat failing for a reason other than absence keeps that reason: reporting EACCES as
 * absence tells the caller the path is not a directory when the path is unreadable. */
export function isExistingDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new UsageError(
      `--cwd is not readable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function parseArgs(argv: string[]): ValidatedOptions {
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

export function signalNumber(name: string): number | undefined {
  return (osConstants.signals as unknown as Record<string, number>)[name];
}

/** What running the command produced. Everything past this point derives from it alone. */
export interface CommandObservation {
  timedOut: boolean;
  executionError: string | null;
  returncode: number | null;
  signalName: string | null;
  stdout: Buffer;
  stderr: Buffer;
  durationMs: number;
}

/** The one impure step. Split out so every verdict branch below is reachable without
 * reproducing the operating-system condition that produces it. */
function observeCommand(options: ValidatedOptions): CommandObservation {
  const startedAt = process.hrtime.bigint();
  let timedOut = false;
  let executionError: string | null = null;
  let returncode: number | null = null;
  let signalName: string | null = null;

  const result = spawnSync("/bin/zsh", ["-c", options.command], {
    cwd: options.cwd,
    timeout: options.timeout_ms,
    // Bounded so a command that streams until its timeout fires cannot exhaust memory, and
    // large enough that a real suite's output fits: exceeding this is not a truncation but an
    // ENOBUFS error, which turns a passing command into a blocked verdict.
    maxBuffer: 64 * 1024 * 1024,
  });
  // Assigned once rather than in each branch: a branch added later would otherwise carry
  // whatever the previous one left behind.
  let stdout = result.stdout ?? Buffer.alloc(0);
  let stderr = result.stderr ?? Buffer.alloc(0);

  if (result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    timedOut = true;
  } else if (result.error) {
    executionError = result.error.message;
    stdout = Buffer.alloc(0);
    stderr = Buffer.alloc(0);
  } else if (result.signal !== null) {
    signalName = result.signal;
    // A signal absent from os.constants keeps its name; only the numeric form is unknown.
    const number = signalNumber(signalName);
    returncode = number === undefined ? null : -number;
  } else {
    returncode = result.status;
  }

  return {
    timedOut,
    executionError,
    returncode,
    signalName,
    stdout,
    stderr,
    durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000),
  };
}

/** Derives the verdict from an observation. Pure, so a test reaches every branch by
 * describing the condition rather than by producing it. */
export function classifyObservation(
  options: ValidatedOptions,
  observed: CommandObservation,
): [number, GateReport] {
  const { expect } = options;
  const command = options.command;
  const { timedOut, executionError, returncode, signalName, stdout, stderr, durationMs } = observed;

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
    // The command failing is not the same as the planned scenario failing. With no line
    // naming one, there is nothing an anchor could be sealed on.
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

function runGate(options: ValidatedOptions): [number, GateReport] {
  return classifyObservation(options, observeCommand(options));
}

export function main(argv: string[]): number {
  let exitCode: number;
  let report: GateReport | BlockedReport;
  try {
    [exitCode, report] = runGate(parseArgs(argv));
  } catch (error) {
    if (!(error instanceof UsageError)) {
      // A defect here and an environment failure reported the same JSON, so the caller could
      // not route on the difference and the stack that localizes the defect was gone.
      process.stdout.write(
        `${JSON.stringify(
          {
            ...blockedReport(error),
            classification: "internal_error",
            reason_codes: ["internal_error"],
            stack: error instanceof Error ? error.stack : null,
          },
          null,
          2,
        )}\n`,
      );
      return 2;
    }
    process.stdout.write(`${JSON.stringify(blockedReport(error), null, 2)}\n`);
    return 2;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return exitCode;
}

if (isMainModule(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
