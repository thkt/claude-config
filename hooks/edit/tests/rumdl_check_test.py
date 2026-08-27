# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/edit/rumdl_check.py (PostToolUse hook).

Run: python3 hooks/edit/tests/rumdl_check_test.py
"""

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import override

HOOK = Path(__file__).resolve().parents[1] / "rumdl_check.py"

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_lib"))

import hook_harness  # noqa: E402

# MD022 (blank line around headings): two headings with no blank line between them.
VIOLATING_MD = """# Heading
## Another Heading
"""

CLEAN_MD = """# Heading

A paragraph rumdl reports nothing on.
"""


class TestRumdlCheck(unittest.TestCase):
    # Declared here because setUp fills them: an attribute first seen inside a method
    # carries no type for a checker.
    tmpdir: tempfile.TemporaryDirectory[str]

    @override
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory(prefix="rumdl_check-tests-")
        self.addCleanup(self.tmpdir.cleanup)

    def write(self, name: str, content: str) -> Path:
        path = Path(self.tmpdir.name) / name
        _ = path.write_text(content, encoding="utf-8")
        return path

    def run_hook(
        self, tool: str, path: Path | str, env: dict[str, str] | None = None
    ) -> subprocess.CompletedProcess[str]:
        payload = {"tool_name": tool, "tool_input": {"file_path": str(path)}}
        return hook_harness.checked(HOOK, payload, env)

    def test_violation_is_printed(self) -> None:
        """T-001 a markdown file carrying a rule violation makes the hook print the violation"""
        path = self.write("violation.md", VIOLATING_MD)
        result = self.run_hook("Write", path)
        self.assertIn("MD022", result.stdout)

    def test_file_unchanged(self) -> None:
        """T-002 the hook leaves the edited file byte-identical to what it received"""
        path = self.write("unchanged.md", VIOLATING_MD)
        before = path.read_bytes()
        _ = self.run_hook("Write", path)
        self.assertEqual(path.read_bytes(), before)

    def test_non_markdown_and_missing_path_skipped(self) -> None:
        """T-003 a path that is not markdown, or does not exist, makes the hook print nothing"""
        with self.subTest("not markdown"):
            path = self.write("violation.txt", VIOLATING_MD)
            result = self.run_hook("Write", path)
            self.assertEqual(result.stdout, "")
        with self.subTest("does not exist"):
            missing = Path(self.tmpdir.name) / "missing.md"
            result = self.run_hook("Write", missing)
            self.assertEqual(result.stdout, "")

    def test_graceful_skip_no_rumdl(self) -> None:
        """T-004 a PATH with no rumdl on it makes the hook print nothing and exit zero"""
        path = self.write("violation.md", VIOLATING_MD)
        env = dict(os.environ, PATH="/usr/bin:/bin")
        result = self.run_hook("Write", path, env=env)
        self.assertEqual(result.stdout, "")
        self.assertEqual(result.returncode, 0)

    def test_clean_file_prints_nothing(self) -> None:
        """A .md carrying no violation makes the hook print nothing"""
        path = self.write("clean.md", CLEAN_MD)
        result = self.run_hook("Write", path)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
