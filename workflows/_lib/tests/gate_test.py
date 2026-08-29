#!/usr/bin/env python3
"""Tests for workflows/_lib/gate.py (deterministic shell gate reports).

Run: python3 workflows/_lib/tests/gate_test.py

The verdict contract goes through the CLI rather than through run_gate, because the
exit code is half of that contract and only the process carries it.
"""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "gate.py"
_spec = importlib.util.spec_from_file_location("gate", SCRIPT)
assert _spec is not None and _spec.loader is not None
gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gate)


def run_cli(*args: str) -> tuple[int, dict[str, object]]:

    with tempfile.TemporaryDirectory() as cwd:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "--cwd", cwd, *args],
            capture_output=True,
            text=True,
            check=False,
        )
    return completed.returncode, json.loads(completed.stdout)


class TailTest(unittest.TestCase):
    def test_returns_whole_output_when_nothing_is_cut(self) -> None:
        self.assertEqual(gate.tail(b"alpha\nbeta\n", 100), "alpha\nbeta\n")

    def test_keeps_the_first_line_when_the_cut_lands_on_a_newline(self) -> None:
        self.assertEqual(gate.tail(b"alpha\nbeta\n", 5), "beta\n")

    def test_drops_a_first_line_the_cut_left_incomplete(self) -> None:
        self.assertEqual(gate.tail(b"alpha\nbeta\n", 8), "beta\n")

    def test_returns_empty_when_the_cut_leaves_no_complete_line(self) -> None:
        self.assertEqual(gate.tail(b"alphabeta", 4), "")

    def test_drops_a_partial_utf8_sequence_with_the_incomplete_line(self) -> None:
        # The cut lands inside the 3-byte U+3042, so the tail must start after the newline.
        data = "あいう\nおわり\n".encode()
        self.assertEqual(gate.tail(data, len(data) - 2), "おわり\n")

    def test_treats_a_carriage_return_as_a_line_end(self) -> None:
        self.assertEqual(gate.tail(b"alpha\rbeta", 8), "beta")


class ExactOutputLineTest(unittest.TestCase):
    def test_accepts_a_complete_line(self) -> None:
        self.assertTrue(gate.has_exact_output_line("not ok 1 - T-001 x\n", "", "not ok 1 - T-001 x"))

    def test_rejects_a_substring_of_a_line(self) -> None:
        self.assertFalse(gate.has_exact_output_line("not ok 1 - T-001 x\n", "", "T-001 x"))

    def test_matches_a_line_in_stderr(self) -> None:
        self.assertTrue(gate.has_exact_output_line("", "FAILED tests/a.py::t", "FAILED tests/a.py::t"))

    def test_rejects_evidence_carrying_a_newline(self) -> None:
        self.assertFalse(gate.has_exact_output_line("a\nb\n", "", "a\nb"))

    def test_rejects_empty_evidence(self) -> None:
        self.assertFalse(gate.has_exact_output_line("\n\n", "", ""))


class VerdictTest(unittest.TestCase):
    def test_passes_when_the_command_succeeds_as_expected(self) -> None:
        code, report = run_cli("--command", "printf 'done\\n'", "--expect", "pass")
        self.assertEqual(code, 0)
        self.assertEqual(report["verdict"], "pass")
        self.assertEqual(report["classification"], "pass")
        self.assertEqual(report["reason_codes"], [])
        self.assertIsNone(report["failure_route"])

    def test_fails_and_routes_when_a_pass_gate_sees_a_nonzero_exit(self) -> None:
        code, report = run_cli(
            "--command", "exit 3", "--expect", "pass", "--failure-route", "green:U-001"
        )
        self.assertEqual(code, 1)
        self.assertEqual(report["verdict"], "fail")
        self.assertEqual(report["reason_codes"], ["unexpected_failure"])
        self.assertEqual(report["failure_route"], "green:U-001")
        evidence = report["evidence"]
        assert isinstance(evidence, dict)
        self.assertEqual(evidence["exit_code"], 3)

    def test_blocks_a_red_gate_that_names_no_output_anchor(self) -> None:
        code, report = run_cli("--command", "exit 1", "--expect", "fail")
        self.assertEqual(code, 2)
        self.assertEqual(report["verdict"], "blocked")
        self.assertEqual(report["classification"], "usage_error")
        self.assertIn("--require-output", str(report["error"]))

    def test_confirms_a_red_gate_whose_anchor_is_a_complete_failure_line(self) -> None:
        code, report = run_cli(
            "--command", "printf 'ok 1 - T-001 x\\nnot ok 2 - T-002 y\\n'; exit 1",
            "--expect", "fail",
            "--require-output", "not ok 2 - T-002 y",
        )
        self.assertEqual(code, 0)
        self.assertEqual(report["verdict"], "pass")
        self.assertEqual(report["classification"], "expected_failure")

    def test_rejects_a_red_anchor_that_only_names_the_test(self) -> None:
        # "T-001 x" occurs inside the passing line, so an unrelated failure satisfies it.
        code, report = run_cli(
            "--command", "printf 'ok 1 - T-001 x\\nnot ok 2 - T-002 y\\n'; exit 1",
            "--expect", "fail",
            "--require-output", "T-001 x",
        )
        self.assertEqual(code, 1)
        self.assertEqual(report["verdict"], "fail")
        self.assertEqual(report["reason_codes"], ["missing_required_output"])

    def test_forbidden_output_matches_a_substring_rather_than_a_whole_line(self) -> None:
        code, report = run_cli(
            "--command", "printf 'warning: deprecated call\\n'",
            "--expect", "pass",
            "--forbid-output", "deprecated",
        )
        self.assertEqual(code, 1)
        self.assertEqual(report["reason_codes"], ["forbidden_output"])

    def test_blocks_and_reports_124_when_the_command_outruns_its_timeout(self) -> None:
        code, report = run_cli("--command", "sleep 5", "--expect", "pass", "--timeout-ms", "200")
        self.assertEqual(code, 124)
        self.assertEqual(report["verdict"], "blocked")
        self.assertEqual(report["reason_codes"], ["timeout"])
        evidence = report["evidence"]
        assert isinstance(evidence, dict)
        self.assertIs(evidence["timed_out"], True)


class UsageTest(unittest.TestCase):
    def test_rejects_an_unknown_flag(self) -> None:
        code, report = run_cli("--command", "true", "--expect", "pass", "--nope", "x")
        self.assertEqual(code, 2)
        self.assertIn("unknown argument: --nope", str(report["error"]))

    def test_rejects_a_repeated_singleton_flag(self) -> None:
        code, report = run_cli("--command", "true", "--command", "false", "--expect", "pass")
        self.assertEqual(code, 2)
        self.assertIn("only once", str(report["error"]))

    def test_rejects_a_relative_working_directory(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "--cwd", "relative/dir", "--command", "true", "--expect", "pass"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 2)
        self.assertIn("--cwd must be absolute", json.loads(completed.stdout)["error"])


class CalibrationTest(unittest.TestCase):
    def test_runs_a_red_command_without_an_anchor_and_marks_the_classification(self) -> None:
        code, report = run_cli(
            "--command", "printf 'not ok 1 - T-001 x\\n'; exit 1", "--calibrate"
        )
        self.assertEqual(code, 0)
        self.assertEqual(report["verdict"], "pass")
        self.assertEqual(report["classification"], "calibration_expected_failure")
        self.assertEqual(report["expected"], "fail")
        evidence = report["evidence"]
        assert isinstance(evidence, dict)
        self.assertEqual(evidence["stdout_tail"], "not ok 1 - T-001 x\n")

    def test_reports_a_calibration_whose_command_unexpectedly_passed(self) -> None:
        code, report = run_cli("--command", "printf 'all green\\n'", "--calibrate")
        self.assertEqual(code, 1)
        self.assertEqual(report["verdict"], "fail")
        self.assertEqual(report["classification"], "calibration_unexpected_pass")

    def test_refuses_an_anchor_because_calibration_is_what_discovers_one(self) -> None:
        code, report = run_cli("--command", "exit 1", "--calibrate", "--require-output", "x")
        self.assertEqual(code, 2)
        self.assertIn("takes no --require-output", str(report["error"]))

    def test_refuses_a_pass_expectation(self) -> None:
        code, report = run_cli("--command", "exit 1", "--calibrate", "--expect", "pass")
        self.assertEqual(code, 2)
        self.assertIn("--expect must be fail", str(report["error"]))

    def test_rejects_a_repeated_calibrate_flag(self) -> None:
        code, report = run_cli("--command", "exit 1", "--calibrate", "--calibrate")
        self.assertEqual(code, 2)
        self.assertIn("only once", str(report["error"]))


if __name__ == "__main__":
    unittest.main()
