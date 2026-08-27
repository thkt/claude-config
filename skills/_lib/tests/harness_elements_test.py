"""Tests for skills/_lib/harness_elements.py.

Run: python3 skills/_lib/tests/harness_elements_test.py
"""

import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from harness_elements import (  # noqa: E402
    ALWAYS_LOADED,
    GLOB_TRIGGERED,
    PATH_TRIGGERED,
    POPULATION_GLOBS,
    classify,
    enumerate_elements,
)


def _instantiate(glob_pattern: str) -> Path:
    """A concrete relative path fitting glob_pattern, derived from POPULATION_GLOBS rather
    than a path hand-copied separately from it (docs/wiki/harness-production-divergence.md)."""
    return Path(glob_pattern.replace("**", "sub").replace("*", "example"))


class Classification(unittest.TestCase):
    def test_a_rules_file_with_no_frontmatter_is_classified_as_always_loaded(self) -> None:
        """T-001 A rules file with no frontmatter is classified as always-loaded"""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "rules" / "sample.md"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("# Sample Rule\n\nBody with no frontmatter block.\n", encoding="utf-8")

            self.assertEqual(classify(path), ALWAYS_LOADED)

    def test_a_rules_file_carrying_a_paths_key_is_classified_as_path_triggered(self) -> None:
        """T-002 A rules file carrying a paths key is classified as path-triggered"""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "rules" / "sample.md"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('---\npaths:\n  - "**/*.ts"\n---\n\n# Sample Rule\n', encoding="utf-8")

            self.assertEqual(classify(path), PATH_TRIGGERED)

    def test_a_docs_wiki_page_carrying_a_non_empty_globs_key_is_classified_as_glob_triggered(
        self,
    ) -> None:
        """T-003 A docs/wiki page carrying a non-empty globs key is classified as glob-triggered"""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "docs" / "wiki" / "sample.md"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                '---\nglobs: ["**/workflows/**/*.js"]\nscenes: []\n---\n\n# Sample Page\n',
                encoding="utf-8",
            )

            self.assertEqual(classify(path), GLOB_TRIGGERED)


class Enumeration(unittest.TestCase):
    def test_a_file_and_its_ja_mirror_are_counted_as_one_element(self) -> None:
        """T-004 A file and its .ja mirror are counted as one element"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rel = _instantiate(POPULATION_GLOBS[0])
            target = root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("# content\n", encoding="utf-8")
            mirror = root / ".ja" / rel
            mirror.parent.mkdir(parents=True, exist_ok=True)
            mirror.write_text("# content\n", encoding="utf-8")

            elements = enumerate_elements(root)

            self.assertEqual(
                len(elements),
                1,
                f"{rel} and its .ja mirror produced {len(elements)} elements: {elements!r}",
            )


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
