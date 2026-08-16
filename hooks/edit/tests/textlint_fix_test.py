"""Integration tests for hooks/edit/textlint-fix.py (PostToolUse hook).

Run: python3 hooks/edit/tests/textlint_fix_test.py
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "textlint-fix.py"

REDUNDANT_MD = """# テスト

この機能はユーザーが設定を変更することができます。また、管理者が権限を付与する事にしました。これにより、運用の効率化が期待されています。
"""

ENGLISH_MD = """# English Document

This is a test document written entirely in English. It should not trigger textlint processing because it does not contain enough Japanese characters.
"""


class TestTextlintFix(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory(prefix="textlint-fix-tests-")
        self.addCleanup(self.tmpdir.cleanup)

    def write(self, name, content):
        path = Path(self.tmpdir.name) / name
        path.write_text(content, encoding="utf-8")
        return path

    def run_hook(self, tool, path, env=None):
        payload = json.dumps({"tool_name": tool, "tool_input": {"file_path": str(path)}})
        return subprocess.run(
            [sys.executable, str(HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )

    def assert_textlint_fixes_md(self, tool, label):
        path = self.write(f"test-{label}.md", REDUNDANT_MD)
        self.run_hook(tool, path)
        self.assertNotIn(
            "することができます", path.read_text(encoding="utf-8"), f"冗長表現が残る ({label})"
        )

    def test_md_write_fixes_file(self):
        """T-003 .md の Write で textlint --fix が走る"""
        self.assert_textlint_fixes_md("Write", "write")

    def test_md_edit_fixes_file(self):
        """T-003 .md の Edit で textlint --fix が走る"""
        self.assert_textlint_fixes_md("Edit", "edit")

    # 1 メソッドが 2 つ以上を主張するときは subTest で包む。包まないと最初の失敗で残りが
    # 走らず、独立に数えていた sh 版より検出が減る。
    def test_ts_file_skipped(self):
        """T-004 .ts は対象外"""
        path = self.write("test.ts", "const x = 1;\n")
        result = self.run_hook("Write", path)
        with self.subTest("exit code 0"):
            self.assertEqual(result.returncode, 0)
        with self.subTest("file unchanged"):
            self.assertEqual(path.read_text(encoding="utf-8"), "const x = 1;\n")

    def test_read_tool_skipped(self):
        """T-005 Read は対象外"""
        result = self.run_hook("Read", "/some/file.md")
        self.assertEqual(result.returncode, 0)

    def test_graceful_skip_no_textlint(self):
        """T-009 textlint が引けないときも落ちない"""
        path = self.write("test-graceful.md", "# テスト\n")
        # bun / npx / textlint を PATH から外す。jq 系は hook が payload を読むのに要るので、
        # 見つかったものだけ残す。
        env = dict(os.environ, PATH="/usr/bin:/bin")
        for name in ("jq", "jaq"):
            found = shutil.which(name)
            if found:
                env["PATH"] += f":{os.path.dirname(found)}"
                break
        result = self.run_hook("Write", path, env=env)
        self.assertEqual(result.returncode, 0, "textlint 不在でクラッシュする")

    def test_english_md_skipped(self):
        """T-011 英語だけの .md は対象外"""
        path = self.write("test-english.md", ENGLISH_MD)
        self.run_hook("Write", path)
        self.assertEqual(path.read_text(encoding="utf-8"), ENGLISH_MD)


if __name__ == "__main__":
    unittest.main(verbosity=2)
