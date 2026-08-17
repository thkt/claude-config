# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Tests for hooks/_lib/mirror_prose.py.

Run: python3 hooks/_lib/tests/mirror_prose_test.py

The unit tests fix the rule against files written here. MirrorSweep runs the same rule over
every real .ja/ file, which the edit-time hook cannot reach.
"""

import sys
import tempfile
import unittest
from pathlib import Path
from typing import override

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import mirror_prose

REPO = Path(__file__).resolve().parents[3]


class TargetSelection(unittest.TestCase):
    def test_a_path_outside_the_mirror_is_not_a_target(self) -> None:
        self.assertFalse(mirror_prose.is_target("/repo/skills/foo/SKILL.md"))

    def test_a_name_merely_containing_ja_is_not_a_target(self) -> None:
        self.assertFalse(mirror_prose.is_target("/repo/skills/foo.ja/SKILL.md"))

    def test_a_file_under_the_mirror_is_a_target(self) -> None:
        self.assertTrue(mirror_prose.is_target("/repo/.ja/skills/foo/SKILL.md"))

    def test_an_en_suffix_declares_intentional_english(self) -> None:
        self.assertFalse(mirror_prose.is_target("/repo/.ja/skills/foo/phrases.en.md"))

    def test_an_untranslated_extension_is_not_a_target(self) -> None:
        self.assertFalse(mirror_prose.is_target("/repo/.ja/skills/foo/config.json"))


class ProseExtraction(unittest.TestCase):
    tmp: tempfile.TemporaryDirectory[str]

    def _write(self, name: str, body: str) -> str:
        path = Path(self.tmp.name) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        _ = path.write_text(body, encoding="utf-8")
        return str(path)

    @override
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_a_python_docstring_and_comment_are_prose(self) -> None:
        path = self._write("m.py", '"""説明."""\n# 注記\nx = 1\n')
        self.assertEqual(mirror_prose.extract_prose(path), ["説明.", "# 注記"])

    def test_a_heading_inside_a_python_literal_is_not_a_comment(self) -> None:
        path = self._write("m.py", 'TEMPLATE = """\n# Heading\n"""\n')
        self.assertEqual(mirror_prose.extract_prose(path), [])

    def test_a_python_shebang_is_not_prose(self) -> None:
        path = self._write("m.py", "#!/usr/bin/env python3\nx = 1\n")
        self.assertEqual(mirror_prose.extract_prose(path), [])

    def test_a_markdown_fence_is_dropped(self) -> None:
        path = self._write("d.md", "本文\n\n```sh\nrm -rf /\n```\n\n続き\n")
        self.assertNotIn("rm -rf /", mirror_prose.extract_prose(path))

    def test_a_shell_comment_is_prose_and_code_is_not(self) -> None:
        path = self._write("s.sh", "#!/bin/sh\n# 注記\nexit 0\n")
        self.assertEqual(mirror_prose.extract_prose(path), ["# 注記"])


class Verdict(unittest.TestCase):
    tmp: tempfile.TemporaryDirectory[str]

    def _write(self, name: str, body: str) -> str:
        path = Path(self.tmp.name) / ".ja" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        _ = path.write_text(body, encoding="utf-8")
        return str(path)

    @override
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_english_only_prose_is_reported_with_its_line_count(self) -> None:
        path = self._write("m.py", "# Convert the payload.\n# Persist it.\nx = 1\n")
        message = mirror_prose.check(path)
        assert message is not None
        self.assertIn("2 行", message)

    def test_a_multiline_docstring_counts_every_line(self) -> None:
        path = self._write("m.py", '"""Convert the payload.\n\nPersist it.\n"""\nx = 1\n')
        message = mirror_prose.check(path)
        assert message is not None
        # Whoever reads "N 行" opens the file and counts against it, so a count of blocks
        # would not line up.
        self.assertIn("2 行", message)

    def test_one_japanese_character_clears_the_guard(self) -> None:
        path = self._write("m.py", "# Convert the payload.\n# 保存する\nx = 1\n")
        self.assertIsNone(mirror_prose.check(path))

    def test_a_file_with_no_prose_has_nothing_to_translate(self) -> None:
        path = self._write("m.py", "x = 1\ny = 2\n")
        self.assertIsNone(mirror_prose.check(path))

    def test_a_japanese_string_literal_does_not_stand_in_for_prose(self) -> None:
        # Counting the whole file would pass here, which is why extraction is prose-only.
        path = self._write("m.py", '# Convert the payload.\nLABEL = "保存"\n')
        self.assertIsNotNone(mirror_prose.check(path))

    def test_markdown_reports_its_label_as_body(self) -> None:
        path = self._write("d.md", "# Heading\n\nThis document explains the flow.\n")
        message = mirror_prose.check(path)
        assert message is not None
        self.assertIn("本文", message)


class MirrorSweep(unittest.TestCase):
    """Every real .ja/ file, which is what the edit-time hook alone cannot cover."""

    def test_no_mirror_file_lost_its_japanese(self) -> None:
        mirror = REPO / ".ja"
        if not mirror.is_dir():
            self.skipTest("no .ja/ directory in this checkout")
        offenders: list[str] = []
        for path in sorted(mirror.rglob("*")):
            if not path.is_file() or not mirror_prose.is_target(str(path)):
                continue
            if mirror_prose.check(str(path)):
                offenders.append(str(path.relative_to(REPO)))
        self.assertEqual(offenders, [], f".ja/ files that lost their Japanese: {offenders}")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
