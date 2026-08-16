# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/edit/mirror_prose_guard.py (PostToolUse hook).

Run: python3 hooks/edit/tests/mirror_prose_guard_test.py
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import override

HOOK = Path(__file__).resolve().parents[1] / "mirror_prose_guard.py"
WARN_MARK = "mirror_prose_guard"


class TestMirrorProseGuard(unittest.TestCase):
    tmpdir: tempfile.TemporaryDirectory[str]

    @override
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory(prefix="mirror-prose-guard-tests-")
        self.addCleanup(self.tmpdir.cleanup)

    # The path decides whether the guard looks at a file, so each case writes its fixture at
    # the path it is meant to be judged by.
    def write_at(self, relative: str, content: str) -> Path:
        path = Path(self.tmpdir.name) / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        _ = path.write_text(content + "\n", encoding="utf-8")
        return path

    def run_hook(self, path: Path, tool: str = "Write") -> str:
        payload = json.dumps({"tool_name": tool, "tool_input": {"file_path": str(path)}})
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
        )
        return result.stdout

    def assert_warned(self, path: Path) -> None:
        self.assertIn(WARN_MARK, self.run_hook(path), "does not warn")

    def assert_silent(self, path: Path) -> None:
        self.assertEqual(self.run_hook(path), "", "warns")

    def test_english_only_source_warns(self) -> None:
        """T-001 A source under .ja/ whose comments are English only warns"""
        path = self.write_at(
            ".ja/hooks/sample.py",
            '# Convert the payload and persist it.\ndef run():\n    """Run the conversion."""\n    return 0',
        )
        self.assert_warned(path)

    def test_one_japanese_character_passes(self) -> None:
        """T-002 A single Japanese character is enough to pass"""
        # What this catches is a whole-file replacement, not a partial drift (a design call
        # made in the hook itself).
        path = self.write_at(
            ".ja/hooks/mixed.py",
            "# Convert the payload and persist it.\n# 変換する\ndef run():\n    return 0",
        )
        self.assert_silent(path)

    def test_markdown_in_english_warns(self) -> None:
        """T-003 Markdown under .ja/ written entirely in English warns"""
        # Leaving .md out means a file that is prose throughout never rings when rewritten
        # into English.
        path = self.write_at(
            ".ja/skills/sample/SKILL.md",
            "# Sample skill\n\nThis skill reviews the diff and reports findings. It runs before the commit lands.",
        )
        self.assert_warned(path)

    def test_markdown_with_japanese_passes(self) -> None:
        """T-004 Markdown in Japanese passes"""
        path = self.write_at(
            ".ja/skills/sample/JA.md",
            "# サンプル\n\nこの skill は差分をレビューして指摘を返す。",
        )
        self.assert_silent(path)

    def test_english_code_fence_does_not_warn(self) -> None:
        """T-005 An English code fence passes when the body is Japanese"""
        # Identifiers fill the fence, so counting the whole file drops the Japanese ratio
        # into a false positive.
        path = self.write_at(
            ".ja/agents/examples.md",
            """# 例

次の関数は読めない。

```typescript
function processOrder(order, user, config, db, logger) {
  const normalized = email.toLowerCase().trim();
  return normalized;
}
```""",
        )
        self.assert_silent(path)

    def test_en_suffix_is_intentional_english(self) -> None:
        """T-006 .en.md is deliberate English and passes"""
        # The name declares it English, so the Japanese ratio does not decide it.
        path = self.write_at(
            ".ja/skills/issue/references/phrases.en.md",
            "# Phrases\n\nUse these English phrases verbatim in the issue body.",
        )
        self.assert_silent(path)

    def test_outside_the_mirror_is_skipped(self) -> None:
        """T-007 Paths outside .ja/ are out of scope"""
        path = self.write_at("skills/sample/SKILL.md", "# Sample\n\nThis skill reviews the diff.")
        self.assert_silent(path)

    def test_unhandled_extension_is_skipped(self) -> None:
        """T-008 An extension out of scope returns nothing"""
        path = self.write_at(".ja/skills/sample/config.json", '{"name": "sample"}')
        self.assert_silent(path)

    def test_read_tool_is_skipped(self) -> None:
        """T-009 Tools other than Write / Edit are out of scope"""
        path = self.write_at(".ja/skills/other/SKILL.md", "# Sample\n\nThis skill reviews the diff.")
        self.assertEqual(self.run_hook(path, tool="Read"), "")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
