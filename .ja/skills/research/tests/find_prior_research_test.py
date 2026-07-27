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

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "find-prior-research.py"


def run(slug, directory):
    """(exit code, parsed stdout JSON) from one CLI invocation."""
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), slug, str(directory)],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode, json.loads(proc.stdout)


def make_dir(*filenames):
    """A temp directory containing an empty .md file per name in filenames."""
    tmp = Path(tempfile.mkdtemp())
    for name in filenames:
        (tmp / name).write_text("", encoding="utf-8")
    return tmp


class FindPriorResearch(unittest.TestCase):
    def test_t001_two_word_overlap_returns_shared_2(self):
        """T-001 slug と語が 2 つ重なるファイルが shared 2 で返る"""
        directory = make_dir("2026-06-01-add-user-dashboard.md")
        code, out = run("add-user-permission-flow", directory)
        self.assertEqual(code, 0)
        shared = {c["file"]: c["shared"] for c in out["candidates"]}
        self.assertEqual(shared["2026-06-01-add-user-dashboard.md"], 2)

    def test_t002_missing_search_dir_returns_empty_candidates(self):
        """T-002 探索ディレクトリが存在しないとき空の候補配列を返す"""
        missing = Path(tempfile.mkdtemp()) / "does-not-exist"
        code, out = run("add-user-permission-flow", missing)
        self.assertEqual(code, 0)
        self.assertEqual(out["candidates"], [])

    def test_t003_zero_overlap_file_is_excluded(self):
        """T-003 語が 1 つも重ならないファイルは候補に含まれない"""
        directory = make_dir("2026-06-01-billing-invoice-export.md")
        code, out = run("add-user-permission-flow", directory)
        self.assertEqual(code, 0)
        files = [c["file"] for c in out["candidates"]]
        self.assertNotIn("2026-06-01-billing-invoice-export.md", files)

    def test_t004_filename_date_prefix_is_excluded_from_word_matching(self):
        """T-004 ファイル名の日付プレフィックスは語の照合対象から外れる"""
        directory = make_dir("2026-07-01-schema-export.md")
        code, out = run("07-01-schema-export", directory)
        self.assertEqual(code, 0)
        shared = {c["file"]: c["shared"] for c in out["candidates"]}
        self.assertEqual(shared["2026-07-01-schema-export.md"], 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
