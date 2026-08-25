#!/usr/bin/env python3
"""Usage: verify_run.py <worktree> <start-count> <expected-commits> <base>

Phase 6 runs this before pushing, so a run that committed fewer elements than triage handed it
never reaches a PR.

stdout: JSON { ok, mismatches: [{field, expected, actual}] }
exit: 0 when ok, 1 otherwise
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import TypedDict

# Every branch point already carries earlier scribe commits wearing this prefix, so the prefix
# alone does not separate one run from the history behind it.
COMMIT_PREFIX = "docs(wiki):"

NOT_A_PAGE = {"_candidates.md", "README.md"}

WIKI_DIR = "docs/wiki"


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


def remaining_rows(repo: Path) -> int:
    path = repo / WIKI_DIR / "_candidates.md"
    if not path.is_file():
        return 0
    inside = False
    count = 0
    for line in path.read_text(encoding="utf-8").split("\n"):
        if line.startswith("## "):
            inside = line.startswith("## 昇格待ち")
            continue
        if inside and line.startswith("- "):
            count += 1
    return count


def verify(repo: Path, start_count: int, expected_commits: int, base: str) -> Report:
    commits = run_commits(repo, base)
    actual_commits = len(commits)
    committed_pages = sum(pages_added(repo, c) for c in commits)
    expected_remaining = start_count - committed_pages
    actual_remaining = remaining_rows(repo)

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
    repo = Path(sys.argv[1])
    start_count = int(sys.argv[2])
    expected_commits = int(sys.argv[3])
    base = sys.argv[4]
    report = verify(repo, start_count, expected_commits, base)
    print(json.dumps(report, ensure_ascii=False))
    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
