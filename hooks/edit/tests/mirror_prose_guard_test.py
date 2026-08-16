"""Integration tests for hooks/edit/ja-prose-guard.py (PostToolUse hook).

Run: python3 hooks/edit/tests/ja_prose_guard_test.py
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "ja-prose-guard.py"
WARN_MARK = "ja-prose-guard"


class TestJaProseGuard(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory(prefix="ja-prose-guard-tests-")
        self.addCleanup(self.tmpdir.cleanup)

    # The path decides whether the guard looks at a file, so each case writes its fixture at
    # the path it is meant to be judged by.
    def write_at(self, relative, content):
        path = Path(self.tmpdir.name) / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content + "\n", encoding="utf-8")
        return path

    def run_hook(self, path, tool="Write"):
        payload = json.dumps({"tool_name": tool, "tool_input": {"file_path": str(path)}})
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
        )
        return result.stdout

    def assert_warned(self, path):
        self.assertIn(WARN_MARK, self.run_hook(path), "警告しない")

    def assert_silent(self, path):
        self.assertEqual(self.run_hook(path), "", "警告が出る")

    def test_english_only_source_warns(self):
        """T-001 .ja/ のソースのコメントが英語だけなら警告する"""
        path = self.write_at(
            ".ja/hooks/sample.py",
            '# Convert the payload and persist it.\ndef run():\n    """Run the conversion."""\n    return 0',
        )
        self.assert_warned(path)

    def test_one_japanese_character_passes(self):
        """T-002 日本語が 1 文字でもあれば通す"""
        # 対象は全文の置き換えであって、部分的なずれではない (hook 本文の設計判断)。
        path = self.write_at(
            ".ja/hooks/mixed.py",
            "# Convert the payload and persist it.\n# 変換する\ndef run():\n    return 0",
        )
        self.assert_silent(path)

    def test_markdown_in_english_warns(self):
        """T-003 .ja/ の Markdown が全文英語なら警告する"""
        # .md を対象外にすると、全体が prose のファイルは英語へ書き換えても鳴らない。
        path = self.write_at(
            ".ja/skills/sample/SKILL.md",
            "# Sample skill\n\nThis skill reviews the diff and reports findings. It runs before the commit lands.",
        )
        self.assert_warned(path)

    def test_markdown_with_japanese_passes(self):
        """T-004 日本語の Markdown は通す"""
        path = self.write_at(
            ".ja/skills/sample/JA.md",
            "# サンプル\n\nこの skill は差分をレビューして指摘を返す。",
        )
        self.assert_silent(path)

    def test_english_code_fence_does_not_warn(self):
        """T-005 本文が日本語ならコードフェンスが英語でも通す"""
        # フェンスの中は識別子が占めるので、全文で数えると日本語率が下がって誤検出になる。
        path = self.write_at(
            ".ja/agents/examples.md",
            "# 例\n\n次の関数は読めない。\n\n```typescript\n"
            "function processOrder(order, user, config, db, logger) {\n"
            "  const normalized = email.toLowerCase().trim();\n"
            "  return normalized;\n}\n```",
        )
        self.assert_silent(path)

    def test_en_suffix_is_intentional_english(self):
        """T-006 .en.md は意図的な英語なので通す"""
        # 命名で英語だと宣言しているので、日本語率で判定しない。
        path = self.write_at(
            ".ja/skills/issue/references/phrases.en.md",
            "# Phrases\n\nUse these English phrases verbatim in the issue body.",
        )
        self.assert_silent(path)

    def test_outside_the_mirror_is_skipped(self):
        """T-007 .ja/ の外は対象外"""
        path = self.write_at("skills/sample/SKILL.md", "# Sample\n\nThis skill reviews the diff.")
        self.assert_silent(path)

    def test_unhandled_extension_is_skipped(self):
        """T-008 対象外の拡張子は何も返さない"""
        path = self.write_at(".ja/skills/sample/config.json", '{"name": "sample"}')
        self.assert_silent(path)

    def test_read_tool_is_skipped(self):
        """T-009 Write / Edit 以外のツールは対象外"""
        path = self.write_at(".ja/skills/other/SKILL.md", "# Sample\n\nThis skill reviews the diff.")
        self.assertEqual(self.run_hook(path, tool="Read"), "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
