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
sys.path.insert(0, str(SCRIPT.parent))

import verify_run  # noqa: E402  (sys.path must be set first)
from triage import Pattern, triage  # noqa: E402  (sys.path must be set first)

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


def _candidates(
    waiting: list[str], rejected: list[str] | None = None, one_off: list[str] | None = None
) -> str:
    rows = [f"- {n}" for n in waiting]
    dropped = [f"- {n}" for n in rejected or []]
    solo = [f"- {n}" for n in one_off or []]
    return "\n".join(
        [
            "# candidates",
            "",
            "## 昇格待ち",
            "",
            *rows,
            "",
            "## 単発",
            "",
            *solo,
            "",
            "## 棄却",
            "",
            *dropped,
        ]
    )


def _init_worktree(
    root: Path, start_waiting: list[str] | None, start_one_off: list[str] | None = None
) -> Path:
    """The baseline carries a `docs(wiki):` commit of its own, because every branch point in
    this repository already holds earlier scribe runs. `start_waiting=None` leaves the store
    out, which is the branch point a first run starts from. `start_one_off` seeds 単発 rows for
    a scenario where a row crosses sections during the run."""
    repo = root / "worktree"
    wiki = repo / "docs" / "wiki"
    wiki.mkdir(parents=True)
    _git(repo, "init", "-q")
    if start_waiting is not None:
        _ = (wiki / "_candidates.md").write_text(
            _candidates(start_waiting, one_off=start_one_off), encoding="utf-8"
        )
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "chore: seed candidates")
    _ = (wiki / "an-earlier-page.md").write_text("# earlier\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "docs(wiki): an-earlier-page を追加/更新")
    return repo


def _assert_mismatch(
    case: unittest.TestCase, report: dict[str, object], field: str, expected: int, actual: int
) -> None:
    mismatches = cast(list[dict[str, object]], report["mismatches"])
    named = [m for m in mismatches if m.get("field") == field]
    case.assertEqual(len(named), 1, f"{field} の mismatch は 1 件: {mismatches}")
    case.assertEqual(named[0]["expected"], expected)
    case.assertEqual(named[0]["actual"], actual)


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
    repo: Path, start_count: int, expected_commits: int, base: str, created: int = 0
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            str(repo),
            str(start_count),
            str(expected_commits),
            base,
            str(created),
        ],
        capture_output=True,
        text=True,
        check=False,
    )


class VerifyRun(unittest.TestCase):
    def test_新規作成のページは昇格待ちから行を減らさない(self) -> None:
        """ページを 1 枚新しく起こした run は、失敗した run ではない"""
        with tempfile.TemporaryDirectory() as tmp:
            start = [f"item{i}" for i in range(5)]
            repo = _init_worktree(Path(tmp), start)
            base = _base(repo)
            wiki = repo / "docs" / "wiki"
            for n in ["item0", "item1", "brand-new"]:
                _ = (wiki / f"{n}.md").write_text(f"# {n}\n", encoding="utf-8")
            _ = (wiki / "_candidates.md").write_text(
                _candidates(["item2", "item3", "item4"]), encoding="utf-8"
            )
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", "docs(wiki): item0, item1, brand-new を追加/更新")

            proc = _run_verify(repo, start_count=5, expected_commits=1, base=base, created=1)

        self.assertEqual(proc.returncode, 0, proc.stdout)
        self.assertEqual(json.loads(proc.stdout)["ok"], True)

    def test_a_row_phase_4_moved_to_棄却_counts_against_the_remaining_rows(self) -> None:
        """A run that dropped an item is not a run that went wrong."""
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
        _assert_mismatch(self, report, "commits", expected=3, actual=2)

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
        _assert_mismatch(self, report, "remaining", expected=0, actual=1)


class FirstRun(unittest.TestCase):
    """SKILL.md Phase 1 step 3 writes the store inside Phase 6's worktree when the repository
    has none, so on that run the store is absent at the branch point and present at HEAD."""

    def _repo_without_store(self, root: Path) -> Path:
        return _init_worktree(root, None)

    def test_store_が_base_に_無い_run_も_verdict_を_返す(self) -> None:
        """Phase 4 は 棄却 へ動かす行が無いので、起こしたページ 1 枚と行 0 件で釣り合う"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._repo_without_store(Path(tmp))
            base = _base(repo)
            wiki = repo / "docs" / "wiki"
            _ = (wiki / "brand-new.md").write_text("# brand-new\n", encoding="utf-8")
            _ = (wiki / "_candidates.md").write_text(_candidates([]), encoding="utf-8")
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", "docs(wiki): brand-new を追加/更新")

            proc = _run_verify(repo, start_count=0, expected_commits=1, base=base, created=1)

        self.assertEqual(proc.returncode, 0, proc.stderr)
        report = cast(dict[str, object], json.loads(proc.stdout))
        self.assertEqual(report["ok"], True)

    def test_store_が_base_に_無くても_行数_のずれ_は_見逃さない(self) -> None:
        """不在を 0 行として読むので、余った行はそのまま remaining の差として出る"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._repo_without_store(Path(tmp))
            base = _base(repo)
            wiki = repo / "docs" / "wiki"
            _ = (wiki / "brand-new.md").write_text("# brand-new\n", encoding="utf-8")
            _ = (wiki / "_candidates.md").write_text(_candidates(["leftover"]), encoding="utf-8")
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", "docs(wiki): brand-new を追加/更新")

            proc = _run_verify(repo, start_count=0, expected_commits=1, base=base, created=1)

        self.assertEqual(proc.returncode, 1, proc.stdout)
        report = cast(dict[str, object], json.loads(proc.stdout))
        _assert_mismatch(self, report, "remaining", expected=0, actual=1)


class ArgumentContract(unittest.TestCase):
    """exit 1 は「検証が通らなかった run」に予約されている。引数が壊れているだけの run が
    同じ値を返すと、呼び出し側は run の失敗と読む。"""

    def _run(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args], capture_output=True, text=True, check=False
        )

    def test_引数が足りない_run_は_exit_2_で_usage_を_出す(self) -> None:
        proc = self._run(".", "0", "1", "HEAD")
        self.assertEqual(proc.returncode, 2, proc.stderr)
        self.assertIn("usage: verify_run.py", proc.stderr)
        self.assertEqual(proc.stdout, "")

    def test_数値でない引数の_run_も_exit_2_で_usage_を_出す(self) -> None:
        proc = self._run(".", "x", "1", "HEAD", "0")
        self.assertEqual(proc.returncode, 2, proc.stderr)
        self.assertIn("usage: verify_run.py", proc.stderr)
        self.assertEqual(proc.stdout, "")


class StoreAtFailures(unittest.TestCase):
    def test_読めない_rev_は_空の_store_ではなく_例外になる(self) -> None:
        """不在を 0 行として読む扱いは、rev が読めた run に限る。読めなかった run まで
        0 行として通すと、読んでいない store から verdict が出る。"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = _init_worktree(Path(tmp), ["item0"])
            with self.assertRaises(subprocess.CalledProcessError):
                _ = verify_run._store_at(repo, "deadbeef" * 5)


def _verify(
    repo: Path, report: dict[str, object], base: str, created: int = 0
) -> dict[str, object]:
    """`verify` is expected to grow a `report` parameter carrying triage's own output (`commits`,
    `deferred`) and stop taking `start_count`/`expected_commits` as self-reported ints -- it
    derives both from `base`'s store and `report` instead."""
    return cast(
        dict[str, object],
        verify_run.verify(repo, report=report, base=base, created=created),
    )


class DerivedFromBaseAndTriage(unittest.TestCase):
    """`section_rows` already counts a heading's rows, and `_store_at` already reads `base`'s
    `_candidates.md` unchanged. `verify` is expected to compose the two into `start_count`
    itself, and to read `expected_commits` off `report["commits"]` rather than trust either as
    an argument."""

    def test_a_run_that_does_not_pass_start_count_counts_the_base_waiting_rows_itself(
        self,
    ) -> None:
        """T-004 `start_count` を渡さない run が base 時点の昇格待ち行数を自分で数える"""
        with tempfile.TemporaryDirectory() as tmp:
            start = [f"item{i}" for i in range(5)]
            repo = _init_worktree(Path(tmp), start)
            base = _base(repo)
            _commit_pages(repo, start, ["item0", "item1", "item2"])

            report: dict[str, object] = {
                "commits": [
                    [{"name": n, "section": "昇格待ち"} for n in ("item0", "item1", "item2")]
                ],
                "deferred": [],
            }
            result = _verify(repo, report, base)

        self.assertEqual(result["ok"], True, result["mismatches"])

    def test_a_run_where_deferred_enters_waiting_grows_the_expected_value_by_the_inflow(
        self,
    ) -> None:
        """T-005 `deferred` が昇格待ちへ入る run の期待値が、流入分だけ増える"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = _init_worktree(Path(tmp), ["item0", "item1"], start_one_off=["solo"])
            base = _base(repo)
            wiki = repo / "docs" / "wiki"
            for n in ["item0", "item1"]:
                _ = (wiki / f"{n}.md").write_text(f"# {n}\n", encoding="utf-8")
            # solo now carries a second piece of evidence and is promotion-worthy, but this
            # run's commit cap leaves it uncommitted, so it moves into 昇格待ち to wait.
            _ = (wiki / "_candidates.md").write_text(_candidates(["solo"]), encoding="utf-8")
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", "docs(wiki): item0, item1 を追加/更新")

            report: dict[str, object] = {
                "commits": [[{"name": n, "section": "昇格待ち"} for n in ("item0", "item1")]],
                "deferred": [{"name": "solo", "section": "単発"}],
            }
            result = _verify(repo, report, base)

        self.assertEqual(result["ok"], True, result["mismatches"])

    def test_a_run_that_updates_an_existing_page_with_status_m_and_clears_its_row_returns_ok_true(
        self,
    ) -> None:
        """T-006 既存ページを M で更新し昇格待ち行を消した run が `ok: true` を返す"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = _init_worktree(Path(tmp), ["some-topic"])
            wiki = repo / "docs" / "wiki"
            # some-topic already has a page before base, so this run's write lands on git as
            # status M (modify), never A (add).
            _ = (wiki / "some-topic.md").write_text("# some-topic\n", encoding="utf-8")
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", "docs(wiki): some-topic を追加/更新")
            base = _base(repo)

            _ = (wiki / "some-topic.md").write_text("# some-topic\n\nmore.\n", encoding="utf-8")
            _ = (wiki / "_candidates.md").write_text(_candidates([]), encoding="utf-8")
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", "docs(wiki): some-topic を追加/更新")

            report: dict[str, object] = {
                "commits": [[{"name": "some-topic", "section": "昇格待ち"}]],
                "deferred": [],
            }
            result = _verify(repo, report, base)

        self.assertEqual(result["ok"], True, result["mismatches"])

    def test_a_one_off_row_that_gains_a_second_piece_of_evidence_and_becomes_a_page_does_not_mismatch(
        self,
    ) -> None:
        """T-007 単発の行が 2 件目の根拠を得てページになった run の期待値が食い違わない"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = _init_worktree(Path(tmp), ["item0"], start_one_off=["solo"])
            base = _base(repo)
            wiki = repo / "docs" / "wiki"
            for n in ["item0", "solo"]:
                _ = (wiki / f"{n}.md").write_text(f"# {n}\n", encoding="utf-8")
            _ = (wiki / "_candidates.md").write_text(_candidates([]), encoding="utf-8")
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", "docs(wiki): item0, solo を追加/更新")

            report: dict[str, object] = {
                "commits": [
                    [
                        {"name": "item0", "section": "昇格待ち"},
                        {"name": "solo", "section": "単発"},
                    ]
                ],
                "deferred": [],
            }
            result = _verify(repo, report, base)

        self.assertEqual(result["ok"], True, result["mismatches"])

    def test_a_commit_built_from_triage_returned_commits_and_pages_makes_verify_run_return_ok_true(
        self,
    ) -> None:
        """T-009 triage が返した commits と pages から組んだコミットが、verify_run で
        `ok: true` になる"""
        patterns: list[Pattern] = [
            {"name": "alpha", "evidence": ["#1", "#2"], "existing": "none"},
            {"name": "beta", "evidence": ["#3", "#4"], "existing": "none"},
        ]
        report = triage(patterns)

        with tempfile.TemporaryDirectory() as tmp:
            repo = _init_worktree(Path(tmp), None)
            base = _base(repo)
            names = [row["name"] for commit in report["commits"] for row in commit]
            _commit_pages(repo, [], names)
            created = sum(1 for page in report["pages"] if page["action"] == "create")

            # `report` here is triage()'s own return value, unmodified: it carries `pages` and
            # `candidates` alongside the `commits`/`deferred` verify_run.verify reads, exactly
            # the shape a real caller would hand it.
            result = verify_run.verify(repo, report=report, base=base, created=created)

        self.assertEqual(result["ok"], True, result["mismatches"])


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
