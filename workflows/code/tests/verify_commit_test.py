#!/usr/bin/env python3
# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp repo.
"""Tests for workflows/code/verify-commit.py (commit postcondition verification).

Run: python3 workflows/code/tests/verify_commit_test.py

Each test commits through real git: a fixture standing in for the plumbing would
not catch a check that reads the wrong git output.
"""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import override

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "verify-commit.py"
# verify-commit.py has a hyphen, so load it by path rather than import name.
_spec = importlib.util.spec_from_file_location("verify_commit", SCRIPT)
assert _spec is not None and _spec.loader is not None
verify_commit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verify_commit)

BODY = "collapse repeated spaces\n\nUnit: U-001\nContract: src/x.ts squeeze\nTests: T-001\nSeam: false"


class VerifyCommitTest(unittest.TestCase):
    @override
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo = Path(self._tmp.name)
        self.git("init", "--quiet", "--initial-branch", "main")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "user.name", "test")
        self.write("README.md", "seed\n")
        self.git("add", "README.md")
        self.git("commit", "--quiet", "-m", "chore: seed")
        self.baseline = self.head()

    def git(self, *args: str) -> str:
        completed = subprocess.run(
            ["git", "-C", str(self.repo), *args], capture_output=True, text=True, check=True
        )
        return completed.stdout.strip()

    def write(self, relative: str, text: str) -> None:
        target = self.repo / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def head(self) -> str:
        return self.git("rev-parse", "HEAD")

    def commit_unit(self, subject: str, body: str = BODY, files: tuple[str, ...] = ("src/x.ts",)) -> None:
        for relative in files:
            self.write(relative, f"// {relative}\n")
        self.git("add", "--", *files)
        message = self.repo / ".git" / "COMMIT_INPUT"
        message.write_text(f"{subject}\n\n{body}\n", encoding="utf-8")
        self.git("commit", "--quiet", "-F", str(message))

    def verify(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "repo": str(self.repo),
            "baseline_head": self.baseline,
            "unit_files": ["src/x.ts", "tests/x.test.ts"],
            "body": BODY,
        }
        payload.update(overrides)
        return verify_commit.verify(payload)

    def test_passes_a_single_in_scope_commit_with_the_declared_body(self) -> None:
        self.commit_unit("feat(core): collapse repeated spaces")
        report = self.verify()
        self.assertEqual(report["verdict"], "pass")
        self.assertEqual(report["blockers"], [])
        self.assertEqual(report["committed_files"], ["src/x.ts"])
        self.assertEqual(report["parent"], self.baseline)

    def test_fails_when_no_commit_was_created(self) -> None:
        report = self.verify()
        self.assertEqual(report["verdict"], "fail")
        self.assertIn("HEAD did not move, so no commit was created", report["blockers"])

    def test_fails_when_a_second_commit_moved_head_off_the_baseline(self) -> None:
        self.commit_unit("feat(core): collapse repeated spaces")
        self.write("src/x.ts", "// again\n")
        self.git("add", "--", "src/x.ts")
        self.git("commit", "--quiet", "-m", "chore: extra")
        report = self.verify()
        self.assertEqual(report["verdict"], "fail")
        self.assertTrue(
            any("exactly one commit must land on it" in str(b) for b in report["blockers"]),
            report["blockers"],
        )

    def test_fails_when_the_commit_carries_a_file_outside_the_unit(self) -> None:
        self.commit_unit("feat(core): collapse repeated spaces", files=("src/x.ts", "src/other.ts"))
        report = self.verify()
        self.assertEqual(report["verdict"], "fail")
        self.assertEqual(report["outside_scope"], ["src/other.ts"])

    def test_fails_when_the_body_block_was_reworded(self) -> None:
        self.commit_unit("feat(core): collapse repeated spaces", body=BODY.replace("T-001", "T-002"))
        report = self.verify()
        self.assertEqual(report["verdict"], "fail")
        self.assertIn(
            "the commit message body does not match the declared block verbatim", report["blockers"]
        )

    def test_fails_when_the_subject_is_not_conventional(self) -> None:
        self.commit_unit("Collapse repeated spaces.")
        report = self.verify()
        self.assertEqual(report["verdict"], "fail")
        self.assertIn("subject ends with a period", report["blockers"])
        self.assertIn("subject is not in <type>(<scope>): <description> form", report["blockers"])

    def test_fails_when_the_subject_runs_past_the_length_limit(self) -> None:
        self.commit_unit(f"feat(core): {'x' * 70}")
        report = self.verify()
        self.assertEqual(report["verdict"], "fail")
        self.assertTrue(
            any("over the 72 limit" in str(b) for b in report["blockers"]), report["blockers"]
        )

    def test_accepts_a_breaking_change_marker_in_the_subject(self) -> None:
        self.commit_unit("feat(core)!: collapse repeated spaces")
        self.assertEqual(self.verify()["verdict"], "pass")


class CliTest(unittest.TestCase):
    def run_cli(self, payload: object) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            check=False,
        )

    def test_exits_1_on_a_malformed_payload_rather_than_reporting_a_pass(self) -> None:
        completed = self.run_cli({"repo": "relative", "baseline_head": "x", "unit_files": [], "body": "b"})
        self.assertEqual(completed.returncode, 1)
        self.assertEqual(completed.stdout, "")
        self.assertIn("repo must be an absolute path", completed.stderr)

    def test_exits_1_on_stdin_that_is_not_json(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT)], input="not json", capture_output=True, text=True, check=False
        )
        self.assertEqual(completed.returncode, 1)
        self.assertIn("stdin is not valid JSON", completed.stderr)


if __name__ == "__main__":
    unittest.main()
