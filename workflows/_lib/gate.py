#!/usr/bin/env python3
"""Usage: gate.py --command CMD --cwd DIR --expect pass|fail [options]

Run one shell command and report the outcome as a deterministic gate report. The
verdict is computed from the exit status and from literal output matching, never
judged by a model. A workflow stage that needs "did the tests pass" invokes this
instead of asking an agent for a boolean.

options:
  --gate-id ID            identifier echoed into the report (default: gate)
  --failure-route ROUTE   where a fail verdict routes (default: triage)
  --timeout-ms N          command timeout in milliseconds (default: 600000)
  --tail-bytes N          bytes of stdout/stderr kept in the report (default: 12000)
  --require-output LINE   repeatable; LINE must equal one complete output line
  --forbid-output TEXT    repeatable; TEXT must not occur anywhere in the output
  --calibrate             run the Red command to discover its failure output
  --planned-test ID:NAME  repeatable; narrows the calibration candidates to lines
                          naming that planned test beside a failure marker

`--expect fail` requires at least one `--require-output` anchor: "the command
failed" alone does not establish that it failed for the intended reason.
`--calibrate` is the one exception, because it is the run that produces the
output an anchor is later chosen from. It forces `--expect fail`, refuses an
anchor, and prefixes its classification with `calibration_`.

A calibration report carries `candidates`: the lines a caller may seal on, each with
an id. Selecting from that set rather than returning a line is what keeps a caller
from sealing on a line it trimmed or invented.

stdout: one gate report JSON object (see REPORT_PROTOCOL).
exit 0 pass, 1 fail, 2 blocked or usage error, 124 timeout. Read the verdict from
the JSON rather than from the exit code alone -- fail-closed: a usage error is a
blocked verdict, never a pass.
"""

import json
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

REPORT_PROTOCOL = "claude-code-gate/v1"
DEFAULT_TIMEOUT_MS = 600_000
DEFAULT_TAIL_BYTES = 12_000
SINGLE_FLAGS = frozenset(
    {
        "--gate-id",
        "--failure-route",
        "--cwd",
        "--expect",
        "--command",
        "--timeout-ms",
        "--tail-bytes",
    }
)
REPEATABLE_FLAGS = frozenset({"--require-output", "--forbid-output", "--planned-test"})
BOOLEAN_FLAGS = frozenset({"--calibrate"})
GATE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
ROUTE_PATTERN = re.compile(
    r"^(?:blocked|triage|(?:red|green|direct):[A-Za-z0-9][A-Za-z0-9._-]*"
    r"|cleanup:[A-Za-z0-9][A-Za-z0-9._-]*)$"
)
LINE_SPLIT = re.compile(r"\r\n|\r|\n")
MAX_CALIBRATION_CANDIDATES = 128
MAX_CALIBRATION_LINE_LENGTH = 2000
FAILURE_MARKER = re.compile(
    r"(?:^\s*not ok\b"
    r"|^\s*(?:FAIL(?:ED|URE)?\b|ERROR\b|\(fail\)|[\u2716\u2715\u00d7\u2717\u274c\u25cf])"
    r"|^\s*\d+\)\s+|\bFAILED\b|\bFAILURE\b)",
    re.IGNORECASE,
)
_LF = 0x0A
_CR = 0x0D


class UsageError(Exception):
    """Reported as a blocked verdict, never as a pass."""


def cast_list(value: object) -> list[str]:
    assert isinstance(value, list)
    return value


def tail(data: bytes, max_bytes: int) -> str:
    """Reporting the cut's first line would offer an anchor no complete line equals."""
    start = max(0, len(data) - max_bytes)
    if start == 0 or data[start - 1] in (_LF, _CR):
        return data[start:].decode("utf-8", errors="replace")
    ends = [index for index in (data.find(_LF, start), data.find(_CR, start)) if index >= 0]
    if not ends:
        return ""
    line_end = min(ends)
    next_line = line_end + 1
    if data[line_end] == _CR and next_line < len(data) and data[next_line] == _LF:
        next_line += 1
    return data[next_line:].decode("utf-8", errors="replace")


def has_exact_output_line(stdout: str, stderr: str, evidence: str) -> bool:
    """Containment would accept a bare test name, which the passing line carries too."""
    if not evidence or "\r" in evidence or "\n" in evidence:
        return False
    return any(evidence in LINE_SPLIT.split(text) for text in (stdout, stderr))


def output_lines(stream: str, text: str) -> list[dict[str, object]]:
    """Every line of one stream, addressed so a caller can name one without retyping it."""
    lines: list[dict[str, object]] = []
    for number, raw in enumerate(LINE_SPLIT.split(text), start=1):
        if not raw.strip() or len(raw) > MAX_CALIBRATION_LINE_LENGTH:
            continue
        lines.append({"id": f"{stream}:{number}", "stream": stream, "text": raw})
    return lines


def names_planned_failure(line: str, name: str) -> bool:
    """A line naming the planned test and, outside that name, carrying a failure marker.

    The name is cut out before the marker is looked for. A test whose own name contains
    "error" would otherwise satisfy the marker on the strength of its name alone.
    """
    at = line.find(name)
    if at < 0:
        return False
    context = line[:at] + line[at + len(name) :]
    return bool(FAILURE_MARKER.search(context))


def calibration_candidates(
    stdout: str, stderr: str, planned: list[tuple[str, str]] | None
) -> list[dict[str, object]]:
    """Lines a caller may seal on. Selecting from a fixed set is what keeps the caller
    from handing back a line it typed, trimmed, or invented."""
    lines = output_lines("stdout", stdout) + output_lines("stderr", stderr)
    if planned is None:
        marked = [line for line in lines if FAILURE_MARKER.search(str(line["text"]))]
        return (marked or lines)[-MAX_CALIBRATION_CANDIDATES:]
    candidates: list[dict[str, object]] = []
    seen: set[str] = set()
    for test_id, name in planned:
        for line in lines:
            if (
                len(candidates) >= MAX_CALIBRATION_CANDIDATES
                or line["id"] in seen
                or not names_planned_failure(str(line["text"]), name)
            ):
                continue
            candidates.append({**line, "test_id": test_id})
            seen.add(str(line["id"]))
    return candidates


def positive_int(value: str, flag: str) -> int:
    try:
        parsed = int(value)
    except ValueError:
        raise UsageError(f"{flag} must be a positive integer") from None
    if parsed <= 0:
        raise UsageError(f"{flag} must be a positive integer")
    return parsed


def parse_args(argv: list[str]) -> dict[str, object]:
    options: dict[str, object] = {
        "gate_id": "gate",
        "failure_route": "triage",
        "timeout_ms": DEFAULT_TIMEOUT_MS,
        "tail_bytes": DEFAULT_TAIL_BYTES,
        "required_output": [],
        "forbidden_output": [],
        "planned_tests": [],
        "calibrate": False,
    }
    seen: set[str] = set()
    index = 0
    while index < len(argv):
        flag = argv[index]
        if flag in BOOLEAN_FLAGS:
            if flag in seen:
                raise UsageError(f"{flag} may be provided only once")
            options["calibrate"] = True
            seen.add(flag)
            index += 1
            continue
        if flag not in SINGLE_FLAGS and flag not in REPEATABLE_FLAGS:
            raise UsageError(f"unknown argument: {flag}")
        if index + 1 >= len(argv):
            raise UsageError(f"missing value for {flag}")
        value = argv[index + 1]
        if flag in SINGLE_FLAGS and flag in seen:
            raise UsageError(f"{flag} may be provided only once")
        if not value:
            raise UsageError(f"{flag} must not be empty")
        if flag == "--gate-id":
            options["gate_id"] = value
        elif flag == "--failure-route":
            options["failure_route"] = value
        elif flag == "--cwd":
            options["cwd"] = value
        elif flag == "--expect":
            options["expect"] = value
        elif flag == "--command":
            options["command"] = value
        elif flag == "--timeout-ms":
            options["timeout_ms"] = positive_int(value, flag)
        elif flag == "--tail-bytes":
            options["tail_bytes"] = positive_int(value, flag)
        elif flag == "--require-output":
            cast_list(options["required_output"]).append(value)
        elif flag == "--forbid-output":
            cast_list(options["forbidden_output"]).append(value)
        elif flag == "--planned-test":
            if ":" not in value:
                raise UsageError("--planned-test must be <test-id>:<test name>")
            cast_list(options["planned_tests"]).append(value)
        seen.add(flag)
        index += 2

    gate_id = str(options["gate_id"])
    if not GATE_ID_PATTERN.match(gate_id) or len(gate_id) > 128:
        raise UsageError("--gate-id has an invalid shape")
    if not ROUTE_PATTERN.match(str(options["failure_route"])):
        raise UsageError(
            "--failure-route must be blocked, triage, red:<unit>, green:<unit>, "
            "direct:<unit>, or cleanup:<name>"
        )
    cwd = options.get("cwd")
    if not cwd:
        raise UsageError("--cwd is required")
    path = Path(str(cwd))
    if not path.is_absolute():
        raise UsageError("--cwd must be absolute")
    if not path.is_dir():
        raise UsageError("--cwd must be an existing directory")
    if options["calibrate"]:
        if options.get("expect") not in (None, "fail"):
            raise UsageError("--calibrate runs the Red command, so --expect must be fail")
        options["expect"] = "fail"
        if cast_list(options["required_output"]):
            raise UsageError("--calibrate discovers the anchor, so it takes no --require-output")
    elif cast_list(options["planned_tests"]):
        raise UsageError("--planned-test only narrows a --calibrate run")
    if options.get("expect") not in ("pass", "fail"):
        raise UsageError("--expect must be pass or fail")
    command = options.get("command")
    if not command or not str(command).strip():
        raise UsageError("--command is required")
    if (
        options["expect"] == "fail"
        and not options["calibrate"]
        and not cast_list(options["required_output"])
    ):
        raise UsageError("--expect fail requires at least one --require-output anchor")
    return options


def run_gate(options: dict[str, object]) -> tuple[int, dict[str, object]]:
    command = str(options["command"])
    expect = str(options["expect"])
    timeout_s = int(str(options["timeout_ms"])) / 1000
    tail_bytes = int(str(options["tail_bytes"]))
    started_at = time.monotonic()
    timed_out = False
    execution_error: str | None = None
    returncode: int | None = None
    stdout = b""
    stderr = b""
    try:
        completed = subprocess.run(
            ["/bin/zsh", "-c", command],
            cwd=str(options["cwd"]),
            capture_output=True,
            timeout=timeout_s,
            check=False,
        )
        returncode = completed.returncode
        stdout = completed.stdout
        stderr = completed.stderr
    except subprocess.TimeoutExpired as expired:
        timed_out = True
        stdout = expired.stdout or b""
        stderr = expired.stderr or b""
    except OSError as error:
        execution_error = str(error)
    duration_ms = round((time.monotonic() - started_at) * 1000)

    stdout_tail = tail(stdout, tail_bytes)
    stderr_tail = tail(stderr, tail_bytes)
    combined = f"{stdout_tail}\n{stderr_tail}"
    signal_name = None
    if returncode is not None and returncode < 0:
        signal_name = signal.Signals(-returncode).name
    command_passed = returncode == 0
    command_failed = returncode is not None and returncode > 0
    matches_expected_exit = command_passed if expect == "pass" else command_failed

    checks: list[dict[str, object]] = [
        {
            "kind": "exit",
            "expected": expect,
            "actual": returncode,
            "signal": signal_name,
            "passed": matches_expected_exit,
        }
    ]
    for value in cast_list(options["required_output"]):
        checks.append(
            {
                "kind": "output_includes",
                "value": value,
                "passed": has_exact_output_line(stdout_tail, stderr_tail, value),
            }
        )
    for value in cast_list(options["forbidden_output"]):
        checks.append({"kind": "output_excludes", "value": value, "passed": value not in combined})

    reason_codes: list[str] = []
    if timed_out:
        verdict, exit_code = "blocked", 124
        reason_codes.append("timeout")
    elif execution_error:
        verdict, exit_code = "blocked", 2
        reason_codes.append("execution_error")
    elif signal_name:
        verdict, exit_code = "blocked", 2
        reason_codes.append("signal")
    else:
        if not matches_expected_exit:
            reason_codes.append("unexpected_pass" if expect == "fail" else "unexpected_failure")
        if any(check["kind"] == "output_includes" and not check["passed"] for check in checks):
            reason_codes.append("missing_required_output")
        if any(check["kind"] == "output_excludes" and not check["passed"] for check in checks):
            reason_codes.append("forbidden_output")
        verdict = "fail" if reason_codes else "pass"
        exit_code = 1 if reason_codes else 0

    default_classification = "expected_failure" if expect == "fail" else "pass"
    classification = reason_codes[0] if reason_codes else default_classification
    candidates: list[dict[str, object]] = []
    if options["calibrate"]:
        planned = [
            (entry.split(":", 1)[0], entry.split(":", 1)[1])
            for entry in cast_list(options["planned_tests"])
        ] or None
        candidates = calibration_candidates(stdout_tail, stderr_tail, planned)
        # The command failing is not the same as the planned scenario failing. With no line
        # naming one, there is nothing an anchor could be sealed on.
        if verdict == "pass" and not candidates:
            verdict, exit_code = "fail", 1
            reason_codes = ["missing_calibration_evidence"]
            classification = "missing_calibration_evidence"
        classification = f"calibration_{classification}"

    failure_route = None
    if verdict == "blocked":
        failure_route = "blocked"
    elif verdict == "fail":
        failure_route = options["failure_route"]
    report: dict[str, object] = {
        "protocol": REPORT_PROTOCOL,
        "gate_id": options["gate_id"],
        "verdict": verdict,
        "classification": classification,
        "reason_codes": reason_codes,
        "failure_route": failure_route,
        "configured_failure_route": options["failure_route"],
        "command": command,
        "cwd": options["cwd"],
        "expected": expect,
        "duration_ms": duration_ms,
        "candidates": candidates,
        "evidence": {
            "kind": "shell",
            "checks": checks,
            "matches_expected_exit": matches_expected_exit,
            "exit_code": returncode,
            "signal": signal_name,
            "timed_out": timed_out,
            "execution_error": execution_error,
            "stdout_tail": stdout_tail,
            "stderr_tail": stderr_tail,
        },
    }
    return exit_code, report


def blocked_report(error: Exception) -> dict[str, object]:
    usage = isinstance(error, UsageError)
    return {
        "protocol": REPORT_PROTOCOL,
        "gate_id": None,
        "verdict": "blocked",
        "classification": "usage_error" if usage else "execution_error",
        "reason_codes": ["usage_error" if usage else "execution_error"],
        "failure_route": "blocked",
        "configured_failure_route": None,
        "error": str(error),
    }


def main(argv: list[str]) -> int:
    try:
        exit_code, report = run_gate(parse_args(argv))
    except (UsageError, OSError) as error:
        print(json.dumps(blocked_report(error), ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return exit_code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
