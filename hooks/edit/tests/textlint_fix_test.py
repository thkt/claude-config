# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/edit/textlint_fix.py (PostToolUse hook).

Run: python3 hooks/edit/tests/textlint_fix_test.py
"""

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import override

HOOK = Path(__file__).resolve().parents[1] / "textlint_fix.py"

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_lib"))

import hook_harness  # noqa: E402

REDUNDANT_MD = """# テスト

この機能はユーザーが設定を変更することができます。また、管理者が権限を付与する事にしました。これにより、運用の効率化が期待されています。
"""

ENGLISH_MD = """# English Document

This is a test document written entirely in English. It should not trigger textlint processing because it does not contain enough Japanese characters.
"""


class TestTextlintFix(unittest.TestCase):
    # Declared here because setUp fills them: an attribute first seen inside a method
    # carries no type for a checker.
    tmpdir: tempfile.TemporaryDirectory[str]

    @override
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory(prefix="textlint_fix-tests-")
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

    def assert_textlint_fixes_md(self, tool: str, label: str) -> None:
        path = self.write(f"test-{label}.md", REDUNDANT_MD)
        _ = self.run_hook(tool, path)
        self.assertNotIn(
            "することができます",
            path.read_text(encoding="utf-8"),
            f"the redundant expression survives ({label})",
        )

    def test_md_write_fixes_file(self) -> None:
        """T-003 A .md Write runs textlint --fix"""
        self.assert_textlint_fixes_md("Write", "write")

    def test_md_edit_fixes_file(self) -> None:
        """T-003 A .md Edit runs textlint --fix"""
        self.assert_textlint_fixes_md("Edit", "edit")

    # A method asserting two or more things wraps each in subTest. Without it the first
    # failure skips the rest, detecting less than the sh version that counted them apart.
    def test_ts_file_skipped(self) -> None:
        """T-004 A .ts file is out of scope"""
        path = self.write("test.ts", "const x = 1;\n")
        _ = self.run_hook("Write", path)
        self.assertEqual(path.read_text(encoding="utf-8"), "const x = 1;\n")

    def test_read_tool_skipped(self) -> None:
        """T-005 The Read tool is out of scope"""
        _ = self.run_hook("Read", "/some/file.md")

    def test_graceful_skip_no_textlint(self) -> None:
        """T-009 An unreachable textlint does not bring the hook down"""
        path = self.write("test-graceful.md", "# テスト\n")
        # Drops bun / npx / textlint from PATH. The hook needs a jq to read its payload, so
        # whichever one resolves stays.
        env = dict(os.environ, PATH="/usr/bin:/bin")
        for name in ("jq", "jaq"):
            found = shutil.which(name)
            if found:
                env["PATH"] += f":{Path(found).parent}"
                break
        _ = self.run_hook("Write", path, env=env)

    def test_english_md_skipped(self) -> None:
        """T-011 A .md written only in English is out of scope"""
        path = self.write("test-english.md", ENGLISH_MD)
        _ = self.run_hook("Write", path)
        self.assertEqual(path.read_text(encoding="utf-8"), ENGLISH_MD)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
