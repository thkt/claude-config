"""Tests for skills/scribe/scripts/verify_run.py.

Run: python3 skills/scribe/tests/verify_run_test.py
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import cast

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "verify_run.py"

GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "scribe-test",
    "GIT_AUTHOR_EMAIL": "scribe-test@example.com",
    "GIT_COMMITTER_NAME": "scribe-test",
    "GIT_COMMITTER_EMAIL": "scribe-test@example.com",
}


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
        env=GIT_ENV,
    )


def _candidates(waiting: list[str], rejected: list[str] | None = None) -> str:
    rows = [f"- {n}" for n in waiting]
    dropped = [f"- {n}" for n in rejected or []]
    return "\n".join(
        ["# candidates", "", "## 昇格待ち", "", *rows, "", "## 単発", "", "## 棄却", "", *dropped]
    )


def _init_worktree(root: Path, start_waiting: list[str]) -> Path:
    """The baseline carries a `docs(wiki):` commit of its own, because every branch point in
    this repository already holds earlier scribe runs."""
    repo = root / "worktree"
    wiki = repo / "docs" / "wiki"
    wiki.mkdir(parents=True)
    _ = (wiki / "_candidates.md").write_text(_candidates(start_waiting), encoding="utf-8")
    _git(repo, "init", "-q")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "chore: seed candidates")
    _ = (wiki / "an-earlier-page.md").write_text("# earlier\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "docs(wiki): an-earlier-page を追加/更新")
    return repo


def _base(repo: Path) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    )
    return proc.stdout.strip()


def _commit_pages(repo: Path, still_waiting: list[str], names: list[str]) -> list[str]:
    """One Phase 6 commit: writes `names` as wiki pages and drops their rows from 昇格待ち,
    using the fixed `docs(wiki): ... を追加/更新` message the skill always commits with.

    Returns the 昇格待ち rows left after this commit, for the caller to chain into the next one.
    """
    wiki = repo / "docs" / "wiki"
    for name in names:
        _ = (wiki / f"{name}.md").write_text(f"# {name}\n", encoding="utf-8")
    left = [n for n in still_waiting if n not in names]
    _ = (wiki / "_candidates.md").write_text(_candidates(left), encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", f"docs(wiki): {', '.join(names)} を追加/更新")
    return left


def _run_verify(
    repo: Path, start_count: int, expected_commits: int, base: str
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(repo), str(start_count), str(expected_commits), base],
        capture_output=True,
        text=True,
        check=False,
    )


class VerifyRun(unittest.TestCase):
    def test_a_row_phase_4_moved_to_棄却_counts_against_the_remaining_rows(self) -> None:
        """Phase 4 drops a row into 棄却 without a page, so counting pages alone reads the store
        as one row short and refuses a run that did nothing wrong."""
        with tempfile.TemporaryDirectory() as tmp:
            start = [f"item{i}" for i in range(5)]
            repo = _init_worktree(Path(tmp), start)
            base = _base(repo)
            wiki = repo / "docs" / "wiki"
            for n in ["item0", "item1"]:
                _ = (wiki / f"{n}.md").write_text(f"# {n}\n", encoding="utf-8")
            _ = (wiki / "_candidates.md").write_text(
                _candidates(["item3", "item4"], rejected=["item2"]), encoding="utf-8"
            )
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", "docs(wiki): item0, item1 を追加/更新")

            proc = _run_verify(repo, start_count=5, expected_commits=1, base=base)

        self.assertEqual(proc.returncode, 0, proc.stdout)
        report = cast(dict[str, object], json.loads(proc.stdout))
        self.assertEqual(report["ok"], True)

    def test_commit_count_and_expected_value_match_and_remaining_rows_also_match_ok_true_exit_0(
        self,
    ) -> None:
        """T-005 コミット本数と期待値が一致し残り行数も一致するとき ok が true で exit 0 になる"""
        with tempfile.TemporaryDirectory() as tmp:
            start = [f"item{i}" for i in range(5)]
            repo = _init_worktree(Path(tmp), start)
            base = _base(repo)
            left = _commit_pages(repo, start, ["item0", "item1", "item2"])
            _commit_pages(repo, left, ["item3", "item4"])

            proc = _run_verify(repo, start_count=5, expected_commits=2, base=base)

        self.assertEqual(proc.returncode, 0, proc.stderr)
        report = cast(dict[str, object], json.loads(proc.stdout))
        self.assertEqual(report["ok"], True)
        self.assertEqual(report["mismatches"], [])

    def test_commit_count_is_fewer_than_expected_ok_false_exit_1_mismatches_names_the_commit_diff(
        self,
    ) -> None:
        """T-006 コミット本数が期待値より少ないとき ok が false で exit 1 になり mismatches が
        コミット本数の差を名指す"""
        with tempfile.TemporaryDirectory() as tmp:
            start = [f"item{i}" for i in range(5)]
            repo = _init_worktree(Path(tmp), start)
            base = _base(repo)
            left = _commit_pages(repo, start, ["item0", "item1", "item2"])
            _commit_pages(repo, left, ["item3", "item4"])

            # 2 commits actually ran, but the caller expected 3 (one short of what triage.py
            # planned) — the mismatch this scenario exists to catch.
            proc = _run_verify(repo, start_count=5, expected_commits=3, base=base)

        self.assertEqual(proc.returncode, 1, proc.stderr)
        report = cast(dict[str, object], json.loads(proc.stdout))
        self.assertEqual(report["ok"], False)
        mismatches = cast(list[dict[str, object]], report["mismatches"])
        commit_mismatches = [m for m in mismatches if m.get("field") == "commits"]
        self.assertEqual(len(commit_mismatches), 1)
        self.assertEqual(commit_mismatches[0]["expected"], 3)
        self.assertEqual(commit_mismatches[0]["actual"], 2)

    def test_remaining_rows_off_the_computed_value_is_ok_false_exit_1_naming_the_row_diff(
        self,
    ) -> None:
        """T-007 残り行数が計算値と違うとき ok が false で exit 1 になり mismatches が
        行数の差を名指す"""
        with tempfile.TemporaryDirectory() as tmp:
            start = [f"item{i}" for i in range(5)]
            repo = _init_worktree(Path(tmp), start)
            base = _base(repo)
            _commit_pages(repo, start, ["item0", "item1", "item2"])

            # Bug under test: this commit writes both item3 and item4 as pages, but its
            # _candidates.md only drops item3's row, so item4's stale row survives.
            wiki = repo / "docs" / "wiki"
            for name in ("item3", "item4"):
                _ = (wiki / f"{name}.md").write_text(f"# {name}\n", encoding="utf-8")
            _ = (wiki / "_candidates.md").write_text(_candidates(["item4"]), encoding="utf-8")
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", "docs(wiki): item3, item4 を追加/更新")

            # 2 commits ran, matching what was expected — only the row count is wrong here.
            proc = _run_verify(repo, start_count=5, expected_commits=2, base=base)

        self.assertEqual(proc.returncode, 1, proc.stderr)
        report = cast(dict[str, object], json.loads(proc.stdout))
        self.assertEqual(report["ok"], False)
        mismatches = cast(list[dict[str, object]], report["mismatches"])
        row_mismatches = [m for m in mismatches if m.get("field") == "remaining"]
        self.assertEqual(len(row_mismatches), 1)
        self.assertEqual(row_mismatches[0]["expected"], 0)
        self.assertEqual(row_mismatches[0]["actual"], 1)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
