#!/usr/bin/env python3
# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs.
"""Tests for workflows/build/diff-files.py (the change listing measured from the branch point).

Run: python3 workflows/build/tests/diff_files_test.py

Each test builds a throwaway git repository so the listing is read off real git output.
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
SCRIPT = HERE.parent / "diff-files.py"
_spec = importlib.util.spec_from_file_location("diff_files", SCRIPT)
assert _spec is not None and _spec.loader is not None
diff_files = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(diff_files)


class DiffFilesTest(unittest.TestCase):
    @override
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo = Path(self._tmp.name).resolve()
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "t@example.com")
        self.git("config", "user.name", "t")
        self.write("a.txt", "a\n")
        self.git("add", "a.txt")
        self.git("commit", "-q", "-m", "chore: seed")
        self.branch_point = self.git("rev-parse", "HEAD")

    def git(self, *args: str) -> str:
        completed = subprocess.run(
            ["git", "-C", str(self.repo), *args],
            capture_output=True,
            text=True,
            check=True,
        )
        return completed.stdout.strip()

    def write(self, relative: str, text: str) -> None:
        path = self.repo / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def lay_out_a_unit_commit_and_leftovers(self) -> None:
        """One committed unit file, one uncommitted tracked edit, two untracked files."""
        self.write("b.txt", "b\n")
        self.git("add", "b.txt")
        self.git("commit", "-q", "-m", "feat(b): add b")
        self.write("a.txt", "a2\n")
        self.write("c.txt", "c\n")
        self.write("dir/d.txt", "d\n")

    # b.txt is the case the base parameter exists for: measured from HEAD after the unit commit
    # it would drop out of the list.
    def test_lists_committed_uncommitted_and_untracked_files_from_the_branch_point(self) -> None:
        self.lay_out_a_unit_commit_and_leftovers()
        report = diff_files.list_files({"repo": str(self.repo), "base": self.branch_point})
        self.assertEqual(report["files"], ["a.txt", "b.txt", "c.txt", "dir/d.txt"])
        self.assertEqual(report["error"], "")
        self.assertEqual(report["base"], self.branch_point)

    def test_untracked_paths_with_spaces_arrive_unquoted(self) -> None:
        self.write("with space.txt", "s\n")
        report = diff_files.list_files({"repo": str(self.repo), "base": self.branch_point})
        self.assertEqual(report["files"], ["with space.txt"])

    def test_returns_null_files_and_the_git_error_on_an_unknown_base(self) -> None:
        report = diff_files.list_files({"repo": str(self.repo), "base": "0123456789abcdef"})
        self.assertIsNone(report["files"])
        self.assertNotEqual(report["error"], "")

    def test_returns_an_empty_list_when_nothing_changed(self) -> None:
        report = diff_files.list_files({"repo": str(self.repo), "base": self.branch_point})
        self.assertEqual(report["files"], [])


class CliTest(unittest.TestCase):
    def run_cli(self, stdin: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=stdin,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_exits_1_on_a_relative_repo_path(self) -> None:
        completed = self.run_cli(json.dumps({"repo": "rel", "base": "HEAD"}))
        self.assertEqual(completed.returncode, 1)
        self.assertEqual(completed.stdout, "")
        self.assertIn("repo must be an absolute path", completed.stderr)

    def test_exits_1_when_base_is_missing(self) -> None:
        completed = self.run_cli(json.dumps({"repo": "/abs/repo"}))
        self.assertEqual(completed.returncode, 1)
        self.assertIn("base must be a non-empty string", completed.stderr)

    def test_exits_1_on_invalid_json(self) -> None:
        completed = self.run_cli("{not json")
        self.assertEqual(completed.returncode, 1)
        self.assertIn("stdin is not valid JSON", completed.stderr)


if __name__ == "__main__":
    unittest.main()
