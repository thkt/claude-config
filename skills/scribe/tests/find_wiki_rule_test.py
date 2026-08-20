"""Tests for skills/scribe/scripts/find_wiki_rule.py.

Run: python3 skills/scribe/tests/find_wiki_rule_test.py
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SCRIPT = HERE.parent / "scripts" / "find_wiki_rule.py"
sys.path.insert(0, str(SCRIPT.parent))

from find_wiki_rule import find, glob_to_regexp, read_globs  # noqa: E402


def wiki(**pages: str) -> str:
    """A temp wiki directory. Each keyword is a page stem, each value its globs line content."""
    tmp = Path(tempfile.mkdtemp())
    for stem, globs in pages.items():
        (tmp / f"{stem.replace('_', '-')}.md").write_text(
            f"---\nglobs: {globs}\n---\n\n# {stem}\n", encoding="utf-8"
        )
    return str(tmp)


class GlobMatching(unittest.TestCase):
    def test_double_star_crosses_directories_and_single_star_stops_at_one(self) -> None:
        crossing = glob_to_regexp("**/agents/**/*.md")
        self.assertTrue(crossing.match("agents/reviewers/x.md"))
        self.assertTrue(crossing.match(".ja/agents/x.md"))
        single = glob_to_regexp("agents/*.md")
        self.assertTrue(single.match("agents/x.md"))
        self.assertFalse(single.match("agents/reviewers/x.md"))

    def test_a_trailing_double_star_matches_no_file(self) -> None:
        """`**/.ja/**` leaves nothing to match the file name, so a page declaring it reaches no
        implementation. The form that works ends with `/*`."""
        self.assertFalse(glob_to_regexp("**/.ja/**").match(".ja/skills/x/SKILL.md"))
        self.assertTrue(glob_to_regexp("**/.ja/**/*").match(".ja/skills/x/SKILL.md"))

    def test_a_dot_is_matched_as_a_dot(self) -> None:
        self.assertFalse(glob_to_regexp("**/*.md").match("agents/xmd"))


class Frontmatter(unittest.TestCase):
    def test_a_page_with_no_globs_key_reads_as_an_empty_list(self) -> None:
        directory = Path(wiki())
        page = directory / "p.md"
        page.write_text("# p\n", encoding="utf-8")
        self.assertEqual(read_globs(page), [])

    def test_a_malformed_globs_line_reads_as_empty_rather_than_throwing(self) -> None:
        """A page is prose a human edits. A broken line drops that page, not the whole run."""
        directory = Path(wiki(p="**/x/**"))
        self.assertEqual(read_globs(directory / "p.md"), [])


class Ranking(unittest.TestCase):
    def test_a_glob_match_is_reported_over_a_word_match(self) -> None:
        """A rule bearing on a file the plan touches is settled; a shared word is a guess."""
        directory = wiki(mirror_drift='["**/.ja/**/*"]', mirror_notes="[]")
        result = find(directory, "mirror drift", [".ja/skills/x/SKILL.md"])
        self.assertEqual([m["page"] for m in result["matched"]], ["mirror-drift.md"])
        self.assertEqual([r["page"] for r in result["related"]], ["mirror-notes.md"])

    def test_a_page_bearing_on_no_file_never_reaches_matched(self) -> None:
        """An empty globs array is the page saying it does not arrive at implementation time."""
        directory = wiki(process_rule="[]")
        result = find(directory, "unrelated", ["src/x.ts"])
        self.assertEqual(result["matched"], [])

    def test_matched_is_ordered_by_how_many_files_the_rule_covers(self) -> None:
        directory = wiki(broad='["**/*.ts"]', narrow='["**/a.ts"]')
        result = find(directory, "x", ["a.ts", "b.ts"])
        self.assertEqual([m["page"] for m in result["matched"]], ["broad.md", "narrow.md"])

    def test_readme_and_candidates_are_not_rule_pages(self) -> None:
        directory = Path(wiki(anything="[]"))
        for name in ("README.md", "_candidates.md"):
            (directory / name).write_text('---\nglobs: ["**/*"]\n---\n', encoding="utf-8")
        result = find(str(directory), "anything", ["x.ts"])
        self.assertEqual(result["matched"], [])


class RealWiki(unittest.TestCase):
    def test_every_glob_this_repository_declares_matches_a_tracked_file(self) -> None:
        """A glob matching nothing is either wrong or names files that no longer exist. Either way
        the page never reaches the implementation it was written for."""
        tracked = subprocess.run(
            ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.splitlines()
        for page in sorted((ROOT / "docs" / "wiki").glob("*.md")):
            for glob in read_globs(page):
                matcher = glob_to_regexp(glob)
                self.assertTrue(
                    any(matcher.match(f) for f in tracked),
                    f"{page.name}: {glob} matches no tracked file",
                )

    def test_the_cli_returns_both_groups_as_json(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), str(ROOT / "docs" / "wiki"), "mirror", ".ja/x.md"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(sorted(json.loads(proc.stdout)), ["matched", "related"])


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
