#!/usr/bin/env python3
# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
"""Tests for workflows/build/verify-pr.py (draft PR existence verification).

Run: python3 workflows/build/tests/verify_pr_test.py

A stub `gh` goes first on PATH. The real gh would make the suite depend on network
and auth.
"""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import override

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "verify-pr.py"
_spec = importlib.util.spec_from_file_location("verify_pr", SCRIPT)
assert _spec is not None and _spec.loader is not None
verify_pr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verify_pr)

VALID = {
    "url": "https://github.com/o/r/pull/7",
    "isDraft": True,
    "baseRefName": "main",
    "headRefName": "feat/x",
}


class VerifyPrTest(unittest.TestCase):
    @override
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.bin = Path(self._tmp.name)
        original = os.environ.get("PATH", "")
        os.environ["PATH"] = f"{self.bin}{os.pathsep}{original}"
        self.addCleanup(lambda: os.environ.__setitem__("PATH", original))

    def stub_gh(self, stdout: str, exit_code: int = 0, stderr: str = "") -> None:
        script = self.bin / "gh"
        script.write_text(
            "#!/bin/sh\n"
            f"printf '%s' {json.dumps(stdout)}\n"
            f"printf '%s' {json.dumps(stderr)} >&2\n"
            f"exit {exit_code}\n",
            encoding="utf-8",
        )
        script.chmod(0o755)

    def verify(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "repository": "o/r",
            "branch": "feat/x",
            "base_branch": "main",
        }
        payload.update(overrides)
        return verify_pr.verify(payload)

    def test_passes_when_gh_returns_a_matching_draft_pull_request(self) -> None:
        self.stub_gh(json.dumps(VALID))
        report = self.verify()
        self.assertEqual(report["verdict"], "pass")
        self.assertEqual(report["blockers"], [])
        self.assertEqual(report["url"], VALID["url"])

    def test_fails_and_withholds_the_url_when_the_pull_request_is_not_a_draft(self) -> None:
        self.stub_gh(json.dumps({**VALID, "isDraft": False}))
        report = self.verify()
        self.assertEqual(report["verdict"], "fail")
        self.assertIsNone(report["url"])
        self.assertTrue(
            any("not a draft" in str(b) for b in report["blockers"]), report["blockers"]
        )

    def test_fails_when_the_pull_request_targets_another_base(self) -> None:
        self.stub_gh(json.dumps({**VALID, "baseRefName": "develop"}))
        report = self.verify()
        self.assertEqual(report["verdict"], "fail")
        self.assertTrue(
            any("base branch is 'develop'" in str(b) for b in report["blockers"]),
            report["blockers"],
        )

    def test_fails_when_the_head_branch_is_not_the_one_the_build_pushed(self) -> None:
        self.stub_gh(json.dumps({**VALID, "headRefName": "other"}))
        report = self.verify()
        self.assertEqual(report["verdict"], "fail")
        self.assertTrue(
            any("head branch is 'other'" in str(b) for b in report["blockers"]), report["blockers"]
        )

    def test_fails_when_gh_exits_nonzero_rather_than_raising(self) -> None:
        self.stub_gh("", exit_code=1, stderr="no pull requests found")
        report = self.verify()
        self.assertEqual(report["verdict"], "fail")
        self.assertEqual(report["reason_codes"], ["ship_verification_failed"])
        self.assertTrue(
            any("no pull requests found" in str(b) for b in report["blockers"]), report["blockers"]
        )

    def test_fails_when_gh_prints_output_that_is_not_json(self) -> None:
        self.stub_gh("<html>not json</html>")
        report = self.verify()
        self.assertEqual(report["verdict"], "fail")
        self.assertGreaterEqual(len(list(report["blockers"])), 1)

    # The Ship agent once opened a PR under an English title of its own instead of the
    # Japanese issue title build.js handed it. The declared title is checked against GitHub.
    def test_passes_when_the_pull_request_carries_the_declared_title(self) -> None:
        self.stub_gh(json.dumps({**VALID, "title": "[実装] サンプル機能を追加する"}))
        report = self.verify(title="[実装] サンプル機能を追加する")
        self.assertEqual(report["verdict"], "pass")
        self.assertEqual(report["title"], "[実装] サンプル機能を追加する")

    def test_fails_when_the_pull_request_title_differs_from_the_declared_one(self) -> None:
        self.stub_gh(json.dumps({**VALID, "title": "Add the sample feature"}))
        report = self.verify(title="[実装] サンプル機能を追加する")
        self.assertEqual(report["verdict"], "fail")
        self.assertTrue(
            any("title is 'Add the sample feature'" in str(b) for b in report["blockers"]),
            report["blockers"],
        )

    def test_leaves_the_title_unchecked_when_none_is_declared(self) -> None:
        self.stub_gh(json.dumps({**VALID, "title": "Add the sample feature"}))
        report = self.verify()
        self.assertEqual(report["verdict"], "pass")


class CliTest(unittest.TestCase):
    def test_exits_1_when_neither_repository_nor_cwd_says_which_repository_to_ask(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=json.dumps({"branch": "feat/x", "base_branch": "main"}),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 1)
        self.assertEqual(completed.stdout, "")
        self.assertIn("either repository or cwd is required", completed.stderr)

    def test_exits_1_on_a_relative_working_directory(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=json.dumps(
                {"repository": "o/r", "branch": "b", "base_branch": "main", "cwd": "rel"}
            ),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 1)
        self.assertIn("cwd must be an absolute path", completed.stderr)


class RepositoryScopeTest(unittest.TestCase):
    @override
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.bin = Path(self._tmp.name)
        original = os.environ.get("PATH", "")
        os.environ["PATH"] = f"{self.bin}{os.pathsep}{original}"
        self.addCleanup(lambda: os.environ.__setitem__("PATH", original))
        script = self.bin / "gh"
        script.write_text(
            "#!/bin/sh\n"
            'printf \'{"url":"u","isDraft":true,"baseRefName":"main","headRefName":"feat/x"}\'\n',
            encoding="utf-8",
        )
        script.chmod(0o755)

    def test_passes_the_repo_flag_when_a_repository_is_given(self) -> None:
        report = verify_pr.verify({"repository": "o/r", "branch": "feat/x", "base_branch": "main"})
        self.assertEqual(report["verdict"], "pass")

    def test_omits_the_repo_flag_and_leans_on_cwd_when_no_repository_is_given(self) -> None:
        report = verify_pr.verify({"branch": "feat/x", "base_branch": "main", "cwd": str(self.bin)})
        self.assertEqual(report["verdict"], "pass")


if __name__ == "__main__":
    unittest.main()
