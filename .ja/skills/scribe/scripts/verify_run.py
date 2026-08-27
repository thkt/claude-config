#!/usr/bin/env python3
"""Usage: verify_run.py <worktree> <start-count> <expected-commits> <base> <created>

Phase 6 が push の前にこれを走らせる。triage が渡した数より少ない要素しかコミットしなかった
run が PR まで届かないようにするため。

stdout: JSON { ok, mismatches: [{field, expected, actual}] }
exit: ok なら 0、そうでなければ 1、引数が無いときは 2
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import TypedDict

# どの分岐点にも、この接頭辞を持つ過去の scribe コミットが既に載っている。接頭辞だけでは
# 1 回の run を背後の履歴から切り分けられない。
COMMIT_PREFIX = "docs(wiki):"

NOT_A_PAGE = {"_candidates.md", "README.md"}

WIKI_DIR = "docs/wiki"

WAITING = "## 昇格待ち"
REJECTED = "## 棄却"
# triage の行自身が持つ section フィールドの素の値。上の WAITING/REJECTED は store の見出しに
# 合わせる "## " 付きの値を持つので、それとは別に用意する。
WAITING_SECTION = WAITING.removeprefix("## ")

USAGE = "usage: verify_run.py <worktree> <start-count> <expected-commits> <base> <created>"


class Mismatch(TypedDict):
    field: str
    expected: int
    actual: int


class Report(TypedDict):
    ok: bool
    mismatches: list[Mismatch]


class TriageRow(TypedDict, total=False):
    """triage.py の Triaged 行のうち、このモジュールが読む部分だけを持つ。triage.py 自身の
    Row と同じく、この run が新規に抽出した行では section が無い。"""

    name: str
    section: str


class TriageReport(TypedDict):
    """triage.py の Report のうち、このモジュールが読む部分だけを持つ。"""

    commits: list[list[TriageRow]]
    deferred: list[TriageRow]


def _git(repo: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return proc.stdout


def run_commits(repo: Path, base: str) -> list[str]:
    out = _git(repo, "log", "--reverse", "--format=%H\x1f%s", f"{base}..HEAD")
    hashes: list[str] = []
    for line in out.splitlines():
        if not line:
            continue
        commit_hash, subject = line.split("\x1f", 1)
        if subject.startswith(COMMIT_PREFIX):
            hashes.append(commit_hash)
    return hashes


def pages_added(repo: Path, commit_hash: str) -> int:
    out = _git(
        repo, "diff-tree", "--no-commit-id", "--name-status", "-r", commit_hash, "--", WIKI_DIR
    )
    count = 0
    for line in out.splitlines():
        if not line:
            continue
        status, path = line.split("\t", 1)
        name = Path(path).name
        if status == "A" and name.endswith(".md") and name not in NOT_A_PAGE:
            count += 1
    return count


def section_rows(text: str, heading: str) -> int:
    inside = False
    count = 0
    for line in text.split("\n"):
        if line.startswith("## "):
            inside = line.startswith(heading)
            continue
        if inside and line.startswith("- "):
            count += 1
    return count


def _store(repo: Path) -> str:
    path = repo / WIKI_DIR / "_candidates.md"
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def _store_at(repo: Path, rev: str) -> str:
    """`git show` の終了コードは見ない。不在と読めないを同じ値で返すので、読めなかった rev
    まで 0 行として通り、誰も読んでいない store から verdict が出る。ls-tree は不在のとき
    何も出さずに 0 で終わり、解決できない rev では落ちる。"""
    if not _git(repo, "ls-tree", "--name-only", rev, f"{WIKI_DIR}/_candidates.md").strip():
        return ""
    return _git(repo, "show", f"{rev}:{WIKI_DIR}/_candidates.md")


def rejected_added(repo: Path, base: str) -> int:
    """Phase 4 は落とした項目の行を、ページを起こさずに 棄却 へ動かす。ページで説明の付かない
    まま 昇格待ち を離れる行が出る。"""
    return section_rows(_store(repo), REJECTED) - section_rows(_store_at(repo, base), REJECTED)


def _verify_reported(
    repo: Path, start_count: int, expected_commits: int, base: str, created: int
) -> Report:
    """CLI 自身は今も start_count/expected_commits を自己申告で受け取る。下の main だけが
    この関数を呼ぶ。導出値へ切り替えた新しい呼び出し側は verify を使う。"""
    commits = run_commits(repo, base)
    actual_commits = len(commits)
    committed_pages = sum(pages_added(repo, c) for c in commits)
    # 新しく起こしたページは候補行を持っていなかったので、蓄積に対して数えると、消えた行を
    # 1 件多く読むことになる。
    promoted = committed_pages - created
    expected_remaining = start_count - promoted - rejected_added(repo, base)
    actual_remaining = section_rows(_store(repo), WAITING)

    mismatches: list[Mismatch] = []
    if actual_commits != expected_commits:
        mismatches.append(
            {"field": "commits", "expected": expected_commits, "actual": actual_commits}
        )
    if actual_remaining != expected_remaining:
        mismatches.append(
            {"field": "remaining", "expected": expected_remaining, "actual": actual_remaining}
        )

    return {"ok": not mismatches, "mismatches": mismatches}


def verify(repo: Path, report: TriageReport, base: str, created: int = 0) -> Report:
    """start_count と expected_commits は、もう呼び出し側の自己申告から受け取らない。数え
    間違えた呼び出し側や、古い値を読んだ呼び出し側がどちらかを取り違えても、この関数には
    それを見抜く手立てがなかった。start_count は _store_at(repo, base) から、expected_commits
    は len(report["commits"]) から、それぞれこのモジュールが既に持っている記録か triage が
    既に出力した値を読んで得る。

    created は受け取るが使わない。上の自己申告版と違い、行自身の section フィールドが
    「昇格待ち から出てコミットされた行（候補行を 1 本消す）」と「消す候補行を元々持って
    いなかった行」を既に見分けられるので、この式には要らない。"""
    expected_commits = len(report["commits"])
    actual_commits = len(run_commits(repo, base))

    start_count = section_rows(_store_at(repo, base), WAITING)
    # 昇格待ち から出てコミットされた行は、その行が持っていた候補行を消す。それ以外の節
    # (単発、あるいはこの run が新規に抽出した行では section 自体が無い) から出た行は、
    # 元々 昇格待ち に候補行を持っていない。
    cleared = sum(
        1
        for commit in report["commits"]
        for row in commit
        if row.get("section") == WAITING_SECTION
    )
    # commit の上限に押し出されて deferred に残った行も、昇格に値することに変わりはないので、
    # store は次の run を待つ間 昇格待ち にその行を置く。他の節 (単発、あるいは新規) から
    # 来た行だけがその節に新しく加わり、元々 昇格待ち にいた行は start_count で既に 1 回
    # 数えたままで動かない。
    inflow = sum(1 for row in report["deferred"] if row.get("section") != WAITING_SECTION)
    expected_remaining = start_count - cleared + inflow - rejected_added(repo, base)
    actual_remaining = section_rows(_store(repo), WAITING)

    mismatches: list[Mismatch] = []
    if actual_commits != expected_commits:
        mismatches.append(
            {"field": "commits", "expected": expected_commits, "actual": actual_commits}
        )
    if actual_remaining != expected_remaining:
        mismatches.append(
            {"field": "remaining", "expected": expected_remaining, "actual": actual_remaining}
        )

    return {"ok": not mismatches, "mismatches": mismatches}


def main() -> None:
    if len(sys.argv) < 6:
        print(USAGE, file=sys.stderr)
        sys.exit(2)
    repo = Path(sys.argv[1])
    base = sys.argv[4]
    # 素の int() にはしない。ValueError は exit 1 になり、それは検証が通らなかった run に
    # 予約されたコードなので、呼び出し側が壊れた数値を失敗した run として読む。
    try:
        start_count, expected_commits, created = (int(sys.argv[i]) for i in (2, 3, 5))
    except ValueError as exc:
        print(f"{USAGE}\n{exc}", file=sys.stderr)
        sys.exit(2)
    report = _verify_reported(repo, start_count, expected_commits, base, created)
    print(json.dumps(report, ensure_ascii=False))
    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
