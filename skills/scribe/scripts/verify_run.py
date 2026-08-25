#!/usr/bin/env python3
"""Usage: verify_run.py <worktree> <start-count> <expected-commits> <base> <created>

Phase 6 runs this before pushing, so a run that committed fewer elements than triage handed it
never reaches a PR.

stdout: JSON { ok, mismatches: [{field, expected, actual}] }
exit: 0 when ok, 1 when not, 2 when an argument is missing
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
    """Absent reads as no rows, the same as _store: SKILL.md Phase 1 step 3 writes the store
    inside Phase 6's worktree when the repository has none, so the first run has nothing at the
    branch point.

    Not a non-zero exit from `git show`: that answers absent and unreadable with the same
    status, and reading an unreadable rev as no rows computes a verdict from a store nobody
    read. `ls-tree` separates the two, printing nothing for an absent path while still failing
    on a rev it cannot resolve.
    """
    if not _git(repo, "ls-tree", "--name-only", rev, f"{WIKI_DIR}/_candidates.md").strip():
        return ""
    return _git(repo, "show", f"{rev}:{WIKI_DIR}/_candidates.md")


def rejected_added(repo: Path, base: str) -> int:
    """Phase 4 moves a dropped item's row into `棄却` without producing a page, so a row can
    leave `昇格待ち` with no page to account for it."""
    return section_rows(_store(repo), REJECTED) - section_rows(_store_at(repo, base), REJECTED)


def verify(repo: Path, start_count: int, expected_commits: int, base: str, created: int) -> Report:
    commits = run_commits(repo, base)
    actual_commits = len(commits)
    committed_pages = sum(pages_added(repo, c) for c in commits)
    # A created page never held a candidate row, so counting it against the store would read
    # one row too many as gone.
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
    # Not a bare int(): its ValueError exits 1, the code reserved for a run whose verification
    # did not pass, so a caller reading the status takes a malformed count for a failed run.
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
