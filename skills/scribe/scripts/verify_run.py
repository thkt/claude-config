#!/usr/bin/env python3
"""Usage: verify_run.py <worktree> <base>   (triage's Phase 3 report JSON on stdin)

Phase 6 runs this before pushing, so a run that committed fewer elements than triage handed it
never reaches a PR.

stdout: JSON { ok, mismatches: [{field, expected, actual}] }
exit: 0 when ok, 1 when not, 2 when an argument or the stdin report is missing
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import TypedDict, cast

# Every branch point already carries earlier scribe commits wearing this prefix, so the prefix
# alone does not separate one run from the history behind it.
COMMIT_PREFIX = "docs(wiki):"

NOT_A_PAGE = {"_candidates.md", "README.md"}

WIKI_DIR = "docs/wiki"

WAITING = "## 昇格待ち"
REJECTED = "## 棄却"
# The bare label a triage row's own `section` field carries, unlike WAITING/REJECTED above which
# carry the "## " a store heading is matched by.
WAITING_SECTION = WAITING.removeprefix("## ")

USAGE = "usage: verify_run.py <worktree> <base>   (triage's Phase 3 report JSON on stdin)"


class Mismatch(TypedDict):
    field: str
    expected: int
    actual: int


class Report(TypedDict):
    ok: bool
    mismatches: list[Mismatch]


class TriageRow(TypedDict, total=False):
    """The slice of triage.py's Triaged row this module reads. `section` is absent on a row
    triage extracted fresh this run, exactly like triage.py's own Row."""

    name: str
    section: str


class TriageReport(TypedDict):
    """The slice of triage.py's Report this module reads."""

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
    """Not `git show`'s exit status: absent and unreadable share it, so a rev that could not be
    read would pass as no rows and the verdict would come from a store nobody read. `ls-tree`
    prints nothing for an absent path and still fails on a rev it cannot resolve."""
    if not _git(repo, "ls-tree", "--name-only", rev, f"{WIKI_DIR}/_candidates.md").strip():
        return ""
    return _git(repo, "show", f"{rev}:{WIKI_DIR}/_candidates.md")


def rejected_added(repo: Path, base: str) -> int:
    """Phase 4 moves a dropped item's row into `棄却` without producing a page, so a row can
    leave `昇格待ち` with no page to account for it."""
    return section_rows(_store(repo), REJECTED) - section_rows(_store_at(repo, base), REJECTED)


def _report(
    expected_commits: int, actual_commits: int, expected_remaining: int, actual_remaining: int
) -> Report:
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


def verify(repo: Path, report: TriageReport, base: str) -> Report:
    """`start_count` and `expected_commits` no longer come from the caller's own count: a caller
    that miscounted, or read a stale value, could pass either one wrong and this function would
    have no way to catch it. `start_count` comes from `_store_at(repo, base)` and
    `expected_commits` from `len(report["commits"])` instead, both read off record this module
    already holds or triage already produced.
    """
    expected_commits = len(report["commits"])
    actual_commits = len(run_commits(repo, base))

    start_count = section_rows(_store_at(repo, base), WAITING)
    # A row committed out of `昇格待ち` clears the candidate line that held it; a row committed out
    # of any other section (`単発`, or absent on a row triage extracted fresh this run) never held
    # a line in `昇格待ち` to clear.
    cleared = sum(
        1 for commit in report["commits"] for row in commit if row.get("section") == WAITING_SECTION
    )
    # A row the commit cap left in `deferred` is still promotion-worthy, so the store carries it
    # under `昇格待ち` to wait for the next run. Only a row arriving from elsewhere
    # (`単発`, or fresh) is new to that section; one already there stays counted once,
    # in start_count.
    inflow = sum(1 for row in report["deferred"] if row.get("section") != WAITING_SECTION)
    expected_remaining = start_count - cleared + inflow - rejected_added(repo, base)
    actual_remaining = section_rows(_store(repo), WAITING)

    return _report(expected_commits, actual_commits, expected_remaining, actual_remaining)


def main() -> None:
    if len(sys.argv) != 3:
        print(USAGE, file=sys.stderr)
        sys.exit(2)
    repo = Path(sys.argv[1])
    base = sys.argv[2]
    # Not a positional count: a caller that miscounted, or read a stale value, would pass a
    # wrong number and this script would have no way to catch it. triage's own report is the
    # record both counts come off.
    try:
        loaded = cast("object", json.loads(sys.stdin.read()))
    except ValueError as exc:
        print(f"{USAGE}\n{exc}", file=sys.stderr)
        sys.exit(2)
    if (
        not isinstance(loaded, dict)
        or not isinstance(loaded.get("commits"), list)
        or not isinstance(loaded.get("deferred"), list)
    ):
        print(f"{USAGE}\nstdin carries no triage report with commits and deferred", file=sys.stderr)
        sys.exit(2)
    report = verify(repo, cast("TriageReport", loaded), base)
    print(json.dumps(report, ensure_ascii=False))
    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
