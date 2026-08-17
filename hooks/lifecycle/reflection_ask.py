#!/usr/bin/env python3
"""Stop hook: ask the agent to write down this session's reflection before finishing.

Stop rather than SessionEnd: SessionEnd cannot inject additionalContext back into the
agent's own turn, so the reflection would never reach the transcript it describes. Stop can,
and it fires once the agent already believes the work is done.

Scoped by session, not by elapsed time: Stop fires on every turn, and a window in minutes
repeats inside a long session while skipping a short one entirely.

Advisory: never blocks the turn from finishing.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this file loadable there.
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

from hook_payload import parse

# A cluster this size is worth distilling into the rule file it belongs to. Integration fires
# on the count rather than on judgement: DR-0097 mechanised the append and left the move to
# judgement, which moved nothing.
BACKLOG_THRESHOLD = 3
MARK_TTL_DAYS = 7

def _prompt(name: str) -> str | None:
    """One level-2 section of the sibling .md. The prompt lives there so it reads as prose
    and textlint reaches it; keeping it here would make the file mostly Japanese string.

    None rather than an empty string when the section is gone: an empty additionalContext
    asks the agent for nothing while still looking like a hook that fired.
    """
    try:
        body = Path(__file__).with_suffix(".md").read_text(encoding="utf-8")
    except OSError:
        return None
    for section in body.split("\n## ")[1:]:
        heading, _, text = section.partition("\n")
        if heading.strip() == name and text.strip():
            return text.strip()
    return None


def _repo_root(cwd: str) -> Path | None:
    """The repository root, not the payload's cwd: a turn run from a subdirectory would grow
    a second .claude/ there."""
    result = subprocess.run(
        ["git", "-C", cwd, "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    return Path(result.stdout.strip())


def _claim(session_id: str) -> bool:
    """One mark per session, not one shared record: the wiring lives in the global settings,
    so every Claude Code process on this machine runs this hook and would overwrite the
    others. False when this session was already asked."""
    marks = Path.home() / ".cache" / "claude-reflection_ask"
    mark = marks / session_id
    if mark.is_file():
        return False
    try:
        marks.mkdir(parents=True, exist_ok=True)
        mark.touch()
    except OSError:
        return False
    cutoff = time.time() - MARK_TTL_DAYS * 86400
    for old in marks.iterdir():
        try:
            if old.stat().st_mtime < cutoff:
                old.unlink(missing_ok=True)
        except OSError:
            pass
    return True


def _backlog(corrections: Path) -> tuple[str, int] | None:
    """The target holding the most rows, once it reaches the threshold. Only the largest
    fires per session, which keeps the turn bounded."""
    counts: dict[str, int] = {}
    try:
        lines = corrections.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return None
    for line in lines:
        if not line.startswith("|"):
            continue
        cells = [c.strip().strip("`") for c in line.split("|")[1:-1]]
        if len(cells) < 2:
            continue
        target = cells[-1]
        if target == "対象" or set(target) <= {"-"}:
            continue
        counts[target] = counts.get(target, 0) + 1
    if not counts:
        return None
    target, count = max(counts.items(), key=lambda kv: kv[1])
    return (target, count) if count >= BACKLOG_THRESHOLD else None


def main() -> None:
    payload = parse(sys.stdin.read())
    session_id = payload.get("session_id")
    cwd = payload.get("cwd")
    if not isinstance(session_id, str) or not session_id:
        return
    if not isinstance(cwd, str) or not cwd:
        return

    # Resolved before the mark is written, so a session that starts outside git still gets
    # asked once it moves into a repository.
    root = _repo_root(cwd)
    if root is None:
        return
    corrections = root / ".claude" / "rules" / "CORRECTIONS.md"

    if not _claim(session_id):
        return

    ask = _prompt("ask")
    if ask is None:
        return
    transcript = payload.get("transcript_path")
    # corrections and rule_file rather than one shared `target`: the two sections are
    # concatenated into a single instruction, and a placeholder naming CORRECTIONS.md in one
    # half and a rule file in the other reads as one referent to whoever follows it.
    message = ask.format(
        transcript=transcript if isinstance(transcript, str) else "",
        corrections=corrections,
    )
    found = _backlog(corrections)
    backlog = _prompt("backlog") if found is not None else None
    if found is not None and backlog is not None:
        rule_file, count = found
        message += "\n\n" + backlog.format(
            rule_file=rule_file, count=count, corrections=corrections
        )

    # additionalContext alone, without systemMessage: the instruction addresses the agent,
    # and printing the same 700 characters into the terminal buries the turn's own answer.
    # suppressOutput keeps the raw payload out of the terminal on top of that.
    print(
        json.dumps(
            {
                "suppressOutput": True,
                "hookSpecificOutput": {
                    "hookEventName": "Stop",
                    "additionalContext": message,
                },
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
