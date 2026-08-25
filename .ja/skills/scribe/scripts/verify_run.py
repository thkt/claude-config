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

USAGE = "usage: verify_run.py <worktree> <start-count> <expected-commits> <base> <created>"


class Mismatch(TypedDict):
    field: str
    expected: int
    actual: int


class Report(TypedDict):
    ok: bool
    mismatches: list[Mismatch]


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
    """不在は _store と同じく 0 行として読む。SKILL.md Phase 1 step 3 が、蓄積の無い
    リポジトリでは Phase 6 の worktree 内で作ると定めているので、初回 run は分岐点に
    何も持たない。

    `git show` の非ゼロ終了は見ない。不在と読めないとを同じ status で返すので、読めない
    rev まで 0 行として通すと、誰も読んでいない store から verdict が出る。ls-tree は
    不在のとき何も出さずに 0 で終わり、解決できない rev では落ちるので、この 2 つを分ける。
    """
    if not _git(repo, "ls-tree", "--name-only", rev, f"{WIKI_DIR}/_candidates.md").strip():
        return ""
    return _git(repo, "show", f"{rev}:{WIKI_DIR}/_candidates.md")


def rejected_added(repo: Path, base: str) -> int:
    """Phase 4 は落とした項目の行を、ページを起こさずに 棄却 へ動かす。ページで説明の付かない
    まま 昇格待ち を離れる行が出る。"""
    return section_rows(_store(repo), REJECTED) - section_rows(_store_at(repo, base), REJECTED)


def verify(repo: Path, start_count: int, expected_commits: int, base: str, created: int) -> Report:
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
    report = verify(repo, start_count, expected_commits, base, created)
    print(json.dumps(report, ensure_ascii=False))
    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
