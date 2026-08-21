#!/usr/bin/env python3
"""PreToolUse hook: stop a commit in this repository when the staged diff adds a term from
the operator's private identifier list.

This repository is public, so a client or organization name that reaches a commit is
published, and scrubbing it afterwards leaves it in the history. The commit is the last point
where removing the term costs one edit instead of a history rewrite.

The list lives outside the repository (see LIST_PATH) because a list of real client names
committed here would be the disclosure it exists to prevent. No term appears in this file.

The gate is scoped to this repository alone. The same terms belong in the client's own
repository, where paths and issue references legitimately carry them.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this file loadable there.
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

from hook_payload import deny, field, parse

GUARDED_REPO = Path(__file__).resolve().parents[2]
LIST_PATH = Path(
    os.environ.get("CLAUDE_CLIENT_NAMES_FILE")
    or Path.home() / ".config" / "claude" / "client-names.txt"
)

# `git commit`, and the porcelain aliases that reach the same place. `git add` is out of
# scope: staging is reversible without touching history.
COMMIT_RE = re.compile(r"\bgit\b(?![^|;&]*\b--dry-run\b)[^|;&]*\bcommit\b")


def _terms() -> list[str]:
    """The identifiers to refuse, lowercased. An absent or comment-only list disables the gate."""
    try:
        raw = LIST_PATH.read_text(encoding="utf-8")
    except OSError:
        return []
    out = []
    for line in raw.splitlines():
        term = line.split("#", 1)[0].strip()
        if term:
            out.append(term.lower())
    return out


def _repo_root(cwd: str) -> Path | None:
    """The git top level of cwd, or None when cwd is not inside a work tree."""
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    return Path(proc.stdout.strip()).resolve()


def _added_lines(cwd: str) -> list[str] | None:
    """Added lines of the staged diff, with their file headers. None when git cannot answer.

    A staged diff that cannot be read is not evidence of a clean commit, so the caller denies
    rather than passing the commit through unchecked.
    """
    try:
        proc = subprocess.run(
            ["git", "diff", "--cached", "--no-color", "--unified=0"],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    keep = []
    for line in proc.stdout.splitlines():
        if line.startswith("+++ ") or (line.startswith("+") and not line.startswith("+++")):
            keep.append(line)
    return keep


def _hit(lines: list[str], terms: list[str]) -> tuple[str, str] | None:
    """The first (term, file) the staged diff adds, or None when it adds none."""
    current = "(unknown file)"
    for line in lines:
        if line.startswith("+++ "):
            current = line[4:].removeprefix("b/")
            continue
        low = line.lower()
        for term in terms:
            if term in low:
                return term, current
    return None


def main() -> None:
    payload = parse(sys.stdin.read())
    if field(payload, "tool_name") != "Bash":
        return
    command = field(payload, "tool_input")
    command = field(command, "command") if command is not None else None
    if not isinstance(command, str) or not COMMIT_RE.search(command):
        return

    terms = _terms()
    if not terms:
        return

    cwd = field(payload, "cwd")
    cwd = cwd if isinstance(cwd, str) and cwd else os.getcwd()
    if _repo_root(cwd) != GUARDED_REPO:
        return

    lines = _added_lines(cwd)
    if lines is None:
        deny(
            f"staged diff を読めないので commit を止めた。{GUARDED_REPO} は public で、"
            "識別子の混入を確認できないまま履歴へ入れると取り消しに履歴書き換えが要る。"
            "git status を確認してからやり直す。"
        )
        return

    found = _hit(lines, terms)
    if found is None:
        return
    term, path = found
    deny(
        f"{path} が private identifier list の語を追加している。{GUARDED_REPO} は public な"
        f"ので、この語を含む行を一般名 (業務リポジトリ、業務案件など) に書き換えてから"
        f"commit する。該当語は {LIST_PATH} の {len(term)} 文字のエントリ。"
    )


if __name__ == "__main__":
    main()
