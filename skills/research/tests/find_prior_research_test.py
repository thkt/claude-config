"""Tests for skills/research/scripts/find-prior-research.py.

Run: python3 skills/research/tests/find_prior_research_test.py

The CLI contract (slug + search-dir arguments -> stdout JSON, exit 0) is
exercised via subprocess, since /research reads the JSON.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import TypedDict, cast

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "find-prior-research.py"


class Candidate(TypedDict):
    file: str
    shared: int


class Report(TypedDict):
    candidates: list[Candidate]
    slug_words: int


def run(slug: str, directory: Path) -> tuple[int, Report]:
    """(exit code, parsed stdout JSON) from one CLI invocation."""
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), slug, str(directory)],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode, cast(Report, json.loads(proc.stdout))


def make_dir(*filenames: str) -> Path:
    """A temp directory containing an empty .md file per name in filenames."""
    tmp = Path(tempfile.mkdtemp())
    for name in filenames:
        _ = (tmp / name).write_text("", encoding="utf-8")
    return tmp


class FindPriorResearch(unittest.TestCase):
    def test_t001_two_word_overlap_returns_shared_2(self) -> None:
        """T-001 a file sharing two words with the slug comes back with shared 2"""
        directory = make_dir("2026-06-01-add-user-dashboard.md")
        code, out = run("add-user-permission-flow", directory)
        self.assertEqual(code, 0)
        shared = {c["file"]: c["shared"] for c in out["candidates"]}
        self.assertEqual(shared["2026-06-01-add-user-dashboard.md"], 2)

    def test_t002_missing_search_dir_returns_empty_candidates(self) -> None:
        """T-002 a missing search directory returns an empty candidate array"""
        missing = Path(tempfile.mkdtemp()) / "does-not-exist"
        code, out = run("add-user-permission-flow", missing)
        self.assertEqual(code, 0)
        self.assertEqual(out["candidates"], [])

    def test_t003_zero_overlap_file_is_excluded(self) -> None:
        """T-003 a file sharing no word is left out of the candidates"""
        directory = make_dir("2026-06-01-billing-invoice-export.md")
        code, out = run("add-user-permission-flow", directory)
        self.assertEqual(code, 0)
        files = [c["file"] for c in out["candidates"]]
        self.assertNotIn("2026-06-01-billing-invoice-export.md", files)

    def test_t004_filename_date_prefix_is_excluded_from_word_matching(self) -> None:
        """T-004 the date prefix of a filename stays out of the word matching"""
        directory = make_dir("2026-07-01-schema-export.md")
        code, out = run("07-01-schema-export", directory)
        self.assertEqual(code, 0)
        shared = {c["file"]: c["shared"] for c in out["candidates"]}
        self.assertEqual(shared["2026-07-01-schema-export.md"], 2)

    def test_candidates_come_back_with_the_largest_overlap_first(self) -> None:
        """The caller reads the top candidate first, so the order carries which match
        is strongest."""
        directory = make_dir(
            "2026-06-01-user-flow.md",
            "2026-06-02-add-user-permission-flow.md",
            "2026-06-03-permission.md",
        )
        code, out = run("add-user-permission-flow", directory)
        self.assertEqual(code, 0)
        self.assertEqual(
            [c["file"] for c in out["candidates"]],
            [
                "2026-06-02-add-user-permission-flow.md",
                "2026-06-01-user-flow.md",
                "2026-06-03-permission.md",
            ],
        )

    def test_slug_words_lets_a_one_word_slug_read_as_a_complete_match(self) -> None:
        """a one-word slug never reaches shared 2, so the count tells a full match from a partial"""
        directory = make_dir("2026-06-01-qualify.md")
        code, out = run("qualify", directory)
        self.assertEqual(code, 0)
        self.assertEqual(out["slug_words"], 1)
        self.assertEqual(out["candidates"][0]["shared"], 1)

    def test_non_markdown_file_is_excluded(self) -> None:
        """a file whose extension is not .md is left out even when words overlap"""
        directory = make_dir("2026-07-02-schema-export.json", "2026-07-01-schema-export.md")
        code, out = run("schema-export", directory)
        self.assertEqual(code, 0)
        files = [c["file"] for c in out["candidates"]]
        self.assertNotIn("2026-07-02-schema-export.json", files)
        self.assertIn("2026-07-01-schema-export.md", files)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
