"""Tests for skills/scribe/scripts/triage.py.

Run: python3 skills/scribe/tests/triage_test.py
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Literal, cast

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "triage.py"
sys.path.insert(0, str(SCRIPT.parent))

from triage import Pattern, Triaged, triage  # noqa: E402

# The same three values triage branches on. A plain str here widens the literal and the helper
# stops building the shape the function accepts.
Existing = Literal["page", "candidate", "none"]


def pattern(name: str, count: int, existing: Existing = "none") -> Pattern:
    return {"name": name, "evidence": [f"#{name}{i}" for i in range(count)], "existing": existing}


class Triage(unittest.TestCase):
    def test_one_piece_of_evidence_stays_a_candidate(self) -> None:
        report = triage([pattern("a", 1)])
        self.assertEqual(report["pages"], [])
        self.assertEqual([c["action"] for c in report["candidates"]], ["candidate"])

    def test_a_first_sighting_backed_twice_becomes_a_page(self) -> None:
        """The invariant sets the bar at two, so a first sighting backed twice need not wait."""
        report = triage([pattern("a", 2)])
        self.assertEqual([(p["name"], p["action"]) for p in report["pages"]], [("a", "create")])

    def test_the_action_follows_where_the_pattern_already_lives(self) -> None:
        report = triage([pattern("a", 2, "page"), pattern("b", 2, "candidate")])
        self.assertEqual([p["action"] for p in report["pages"]], ["update", "promote"])

    def test_pages_past_the_cap_are_deferred_thinnest_evidence_first(self) -> None:
        """A run moving every qualifying pattern outgrows what COMMIT_CAP commits can hold."""
        patterns = [
            pattern("a", 2),
            pattern("b", 5),
            pattern("c", 3),
            pattern("d", 4),
            pattern("e", 6),
            pattern("f", 7),
            pattern("g", 8),
            pattern("h", 9),
            pattern("i", 10),
            pattern("j", 11),
        ]
        report = triage(patterns)
        self.assertEqual(
            [p["name"] for p in report["pages"]],
            ["j", "i", "h", "g", "f", "e", "b", "d", "c"],
        )
        self.assertEqual([p["name"] for p in report["deferred"]], ["a"])

    def test_candidates_do_not_consume_the_page_cap(self) -> None:
        """Candidates cost nothing to review, so counting them would starve the pages."""
        report = triage(
            [pattern("a", 1), pattern("b", 1), pattern("c", 2), pattern("d", 2), pattern("e", 2)]
        )
        self.assertEqual(len(report["pages"]), 3)
        self.assertEqual(len(report["candidates"]), 2)

    def test_the_cli_takes_the_array_and_the_store_and_returns_the_four_groups(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "_candidates.md"
            _ = path.write_text("# candidates\n\n## 昇格待ち\n\n## 単発\n", encoding="utf-8")
            proc = subprocess.run(
                [sys.executable, str(SCRIPT), json.dumps([pattern("a", 2)]), str(path)],
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(proc.returncode, 0)
        report = cast(dict[str, object], json.loads(proc.stdout))
        self.assertEqual(sorted(report), ["candidates", "commits", "deferred", "pages"])

    def test_the_cli_stops_when_the_store_path_is_missing(self) -> None:
        """An optional path would put the carried-over rows back at the caller's discretion,
        which is the shape #504 came from."""
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), json.dumps([pattern("a", 2)])],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 2)
        self.assertIn("candidates-file", proc.stderr)

    def test_a_store_that_does_not_exist_yet_reads_as_no_rows(self) -> None:
        """Phase 1 creates the store inside Phase 6's worktree, so the first run has none."""
        with tempfile.TemporaryDirectory() as tmp:
            proc = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    json.dumps([pattern("a", 2)]),
                    str(Path(tmp) / "_candidates.md"),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(proc.returncode, 0)
        report = cast(dict[str, list[Triaged]], json.loads(proc.stdout))
        self.assertEqual([p["name"] for p in report["pages"]], ["a"])


# The store lines the fixtures below stand for. Content stays Japanese because the store this
# repository keeps is Japanese, and the parse has to survive that.
STARVED = "hook のコマンド判定は shlex による位置の解析で行う"
WAITING = "テンプレートは validator が要求するフィールドを載せる"
ONE_OFF = "user rule の paths frontmatter は originalCwd 相対で評価される"
SHARED = "linter の false positive は理由コメント付き disable で抑止する"


def store(waiting: list[str], one_off: list[str]) -> str:
    """A store file carrying the two headings the skill writes into."""
    return "\n".join(["# candidates", "", "## 昇格待ち", "", *waiting, "", "## 単発", "", *one_off])


def run_cli(patterns: list[Pattern], text: str) -> dict[str, list[Triaged]]:
    """Run the CLI with the freshly extracted array and a store written to a temporary file.

    The store path is passed on argv rather than the array being pre-merged here, because the
    manual merge is exactly what #504 showed no run performs.
    """
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "_candidates.md"
        _ = path.write_text(text, encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), json.dumps(patterns), str(path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
    assert proc.returncode == 0, proc.stderr
    return cast(dict[str, list[Triaged]], json.loads(proc.stdout))


class StoreMerge(unittest.TestCase):
    """The script reads the store itself (#504).

    Decision table for where a pattern comes from. The Triage class above already covers the
    fresh-only row, so the two rows the store introduces are the ones tested here:

    | in the store | in the fresh array | expected                                               |
    | ------------ | ------------------ | ------------------------------------------------------ |
    | yes          | no                 | enters triage as a candidate and sorts by its evidence |
    | no           | yes                | enters triage as before                                |
    | yes          | yes                | folds into one row whose evidence is the union         |

    Perspectives: Combination (the merge), Boundary (the two-evidence bar and the three-page cap),
    Hazard (a store row starved by the cap while thinner patterns take the pages).
    """

    def test_a_store_row_outranks_thinner_fresh_patterns_for_the_page_cap(self) -> None:
        """#504 itself: a row backed seven times sat in 昇格待ち for five runs while patterns
        backed four times took every page. The row reaches the cap only when the script reads
        the store, since nothing else puts it back into the sort. Nine same-count fresh patterns
        push the total past COMMIT_CAP * PAGE_CAP so the cap still binds and the thinnest-tied
        row (the last one in input order) is what gets deferred."""
        fresh = [pattern(chr(ord("a") + i), 4) for i in range(9)]
        report = run_cli(
            fresh,
            store([f"- {STARVED} #349 #350 #351 #352 #353 #354 (research)"], []),
        )
        self.assertEqual(report["pages"][0]["name"], STARVED)
        self.assertEqual(report["pages"][0]["count"], 7)
        self.assertEqual(len(report["pages"]), 9)
        self.assertEqual([p["name"] for p in report["deferred"]], ["i"])

    def test_both_headings_are_read_and_the_evidence_is_cut_off_the_name(self) -> None:
        """A parse taking 昇格待ち alone drops the 単発 row that a second sighting would promote.
        Evidence left on the name makes the page file name carry issue numbers."""
        report = run_cli([], store([f"- {WAITING} #330 (research)"], [f"- {ONE_OFF} #59"]))
        self.assertEqual(
            [(p["name"], p["count"], p["action"]) for p in report["pages"]],
            [(WAITING, 2, "promote")],
        )
        self.assertEqual(report["pages"][0]["evidence"], ["#330", "(research)"])
        self.assertEqual([(c["name"], c["count"]) for c in report["candidates"]], [(ONE_OFF, 1)])

    def test_a_name_held_by_both_sides_folds_into_one_row_with_the_evidence_united(self) -> None:
        """Two rows under one name split the same pattern's evidence, and the store would gain a
        second line for a page it already has. A repeated piece of evidence is counted once."""
        fresh: Pattern = {"name": SHARED, "evidence": ["#168", "#390"], "existing": "none"}
        report = run_cli([fresh], store([f"- {SHARED} #167 #168"], []))
        rows = report["pages"] + report["candidates"] + report["deferred"]
        self.assertEqual([r["name"] for r in rows], [SHARED])
        self.assertEqual(sorted(rows[0]["evidence"]), ["#167", "#168", "#390"])
        self.assertEqual(rows[0]["count"], 3)


class DroppedRows(unittest.TestCase):
    """A row whose body is gone leaves the ranking. Silently, the run proceeds on a candidate
    count smaller than the store holds and nothing tells the operator which row went missing."""

    def _run(self, text: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "_candidates.md"
            _ = path.write_text(text, encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(SCRIPT), "[]", str(path)],
                capture_output=True,
                text=True,
                encoding="utf-8",
                check=False,
            )

    def test_本文の無い行は件数と本文つきで_stderr_に出る(self) -> None:
        proc = self._run(store(["- #123 (research)", f"- {WAITING} #200"], []))

        self.assertEqual(proc.returncode, 0)
        self.assertIn("1", proc.stderr)
        self.assertIn("- #123 (research)", proc.stderr)

    def test_落とす行が無い_run_の_stderr_は空(self) -> None:
        proc = self._run(store([f"- {WAITING} #200"], []))

        self.assertEqual(proc.returncode, 0)
        self.assertEqual(proc.stderr, "")

    def test_報告は_stdout_の_4_キーを増やさない(self) -> None:
        proc = self._run(store(["- #123 (research)"], []))

        self.assertEqual(
            sorted(cast(dict[str, object], json.loads(proc.stdout))),
            ["candidates", "commits", "deferred", "pages"],
        )


class Commits(unittest.TestCase):
    """PAGE_CAP moved from per-run to per-commit, so a run's promoted pages split into
    PAGE_CAP-sized commits and stop at COMMIT_CAP of them."""

    def test_t001_nine_promoted_rows_split_into_three_commits_of_three(self) -> None:
        """T-001 昇格待ちが 9 行のとき commits が 3 要素になり、各要素が 3 ページを持つ"""
        patterns = [pattern(f"p{i}", 2) for i in range(9)]
        report = triage(patterns)
        self.assertEqual(len(report["commits"]), 3)
        for commit in report["commits"]:
            self.assertEqual(len(commit), 3)

    def test_t002_ten_or_more_promoted_rows_cap_commits_at_three_and_defer_the_rest(self) -> None:
        """T-002 昇格待ちが 10 行以上のとき commits が 3 要素で止まり、超過分が deferred に入る"""
        patterns = [pattern(f"p{i}", 2) for i in range(10)]
        report = triage(patterns)
        self.assertEqual(len(report["commits"]), 3)
        self.assertEqual([p["name"] for p in report["deferred"]], ["p9"])

    def test_t003_the_output_keys_include_commits_and_pages_equals_commits_flattened(
        self,
    ) -> None:
        """T-003 出力のキーが commits を含めた 4 つになり、pages が commits を
        平らにしたものと一致する"""
        report = triage([pattern("a", 2), pattern("b", 1), pattern("c", 3)])
        self.assertEqual(sorted(report), ["candidates", "commits", "deferred", "pages"])
        flattened = [item for commit in report["commits"] for item in commit]
        self.assertEqual(report["pages"], flattened)

    def test_t004_two_promoted_rows_form_one_commit_of_two(self) -> None:
        """T-004 昇格待ちが 2 行のとき commits が 1 要素になり、その要素が 2 ページを持つ"""
        report = triage([pattern("a", 2), pattern("b", 2)])
        self.assertEqual(len(report["commits"]), 1)
        self.assertEqual(len(report["commits"][0]), 2)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
