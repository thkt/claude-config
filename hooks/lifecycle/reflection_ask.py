#!/usr/bin/env python3
"""Stop hook: hand this session's reflection to a separate headless Claude Code run.

Stop rather than SessionEnd, which never fires when the process is killed.

Detached rather than injected into the turn: an instruction on additionalContext spends the
session's own context, interrupts the turn it lands in, and leaves its report line trailing
the answer.

Scoped by session rather than by elapsed time: a window in minutes repeats inside a long
session and skips a short one entirely.

Never blocks the turn from finishing.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this file loadable there.
from __future__ import annotations

import contextlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

from hook_payload import parse

CACHE = Path.home() / ".cache" / "claude-reflection_ask"
RUNS = CACHE / "runs"
SENTINEL = CACHE / "spawning"

MARK_TTL_DAYS = 7

# Fires on the count rather than on a judgement of what deserves distilling, which is the half
# that never happens on its own.
BACKLOG_THRESHOLD = 3

# Long enough for a child to read a full transcript and write, short enough that a child killed
# before its cleanup does not switch reflection off for the rest of the day.
SPAWN_TTL_SECONDS = 30 * 60

# Not a cheap model: deciding what is worth keeping is the whole of the job.
MODEL = "sonnet"

# acceptEdits cannot reach the target. .claude/ counts as a sensitive file, and neither
# acceptEdits nor a permissions.allow rule naming the absolute path gets an Edit through.
# PreToolUse hooks still fire and can still deny under this mode, so what it drops is the
# permission rules and the sensitive-file check rather than the guardrails layer.
PERMISSION_MODE = "bypassPermissions"

# The tools have to be taken away by name: --allowedTools names what passes without a prompt
# and leaves the full set reachable, which under this permission mode means shell and subagents.
# Bash carries its own reason: a child refused an Edit reaches for the shell and writes the
# file that way. A name no tool answers to prints a warning into the log, so each one here has
# to be a real tool.
DENIED_TOOLS = "Bash Task Agent WebFetch WebSearch NotebookEdit"

# The exit line and the report line above it are the last two by construction, so the tail is
# all this costs. A child's log otherwise holds its entire reply, read on every Stop of every
# session. Sized past the report line, which runs to roughly 100 bytes of Japanese.
TAIL_BYTES = 512

# A child that was refused its write still exits 0, so the exit code alone cannot tell a run
# that did its job from one that only said why it could not.
#
# The count alone, and the spacing left free: children write 追記1件 as readily as 追記 1 件,
# and prefix the line with a remark. What a refused run never produces is a count.
REPORT = re.compile(r"追記\s*\d+\s*件")


def _stale_before() -> float:
    return time.time() - MARK_TTL_DAYS * 86400


def _prompt(name: str) -> str | None:
    """One level-2 section of the sibling .md, which holds the prose so textlint reaches it.

    None rather than an empty string: an empty prompt sends the child after nothing while still
    looking like a hook that fired.
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
    """The repository root rather than the payload's cwd, which would grow a second .claude/
    under whichever subdirectory the turn ran from."""
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
    """False when this session was already handled.

    One mark per session rather than one shared record: the wiring lives in the global
    settings, so every Claude Code process on this machine would overwrite the others.
    """
    mark = CACHE / session_id
    if mark.is_file():
        return False
    try:
        CACHE.mkdir(parents=True, exist_ok=True)
        mark.touch()
    except OSError:
        return False
    cutoff = _stale_before()
    for old in CACHE.iterdir():
        # runs/ and the sentinel sit in this directory under their own lifetimes, and unlink on
        # a directory would raise here every session.
        if not old.is_file() or old == SENTINEL:
            continue
        try:
            if old.stat().st_mtime < cutoff:
                old.unlink(missing_ok=True)
        except OSError:
            pass
    return True


def _hold_spawn() -> bool:
    """False when a child is already running.

    The child runs this hook too and its fresh session_id walks straight past _claim, so
    nothing else stops the recursion. The same file keeps two sessions stopping at once from
    sending two children at one CORRECTIONS.md.

    The window matters as much as the file: a child killed before its cleanup would leave the
    sentinel behind and switch reflection off silently.
    """
    try:
        if SENTINEL.is_file() and time.time() - SENTINEL.stat().st_mtime < SPAWN_TTL_SECONDS:
            return False
        CACHE.mkdir(parents=True, exist_ok=True)
        SENTINEL.touch()
    except OSError:
        return False
    return True


def _backlog(corrections: Path) -> tuple[str, int] | None:
    """The target holding the most rows, once it reaches the threshold. Only the largest fires
    per session, which bounds the child's job."""
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


def _message(corrections: Path, transcript: str) -> str | None:
    ask = _prompt("ask")
    if ask is None:
        return None
    # corrections and rule_file rather than one shared `target`: the two sections concatenate
    # into a single instruction, where one placeholder naming CORRECTIONS.md and another naming
    # a rule file read as one referent.
    message = ask.format(transcript=transcript, corrections=corrections)
    found = _backlog(corrections)
    backlog = _prompt("backlog") if found is not None else None
    if found is not None and backlog is not None:
        rule_file, count = found
        message += "\n\n" + backlog.format(
            rule_file=rule_file, count=count, corrections=corrections
        )
    return message


def _claude() -> str:
    """The launcher rather than a version directory, because the launcher follows upgrades on
    its own. Overridable so a test can point it at a stub that records its arguments."""
    return os.environ.get(
        "REFLECTION_ASK_CLAUDE", str(Path.home() / ".local" / "bin" / "claude")
    )


def _spawn(root: Path, session_id: str, message: str) -> None:
    """Start the child and return without waiting for it.

    start_new_session keeps it out of this hook's process group, where the 10 second timeout
    and Claude Code's own exit would take it down mid-write.

    The prompt travels by file rather than on the command line, which would carry past 2000
    characters of Japanese through two levels of quoting.
    """
    run = RUNS / session_id
    try:
        run.mkdir(parents=True, exist_ok=True)
        prompt = run / "prompt.md"
        _ = prompt.write_text(message, encoding="utf-8")
    except OSError:
        return
    log = run / "log.txt"
    command = (
        f"{shlex.quote(_claude())} -p \"$(cat {shlex.quote(str(prompt))})\""
        f" --permission-mode {PERMISSION_MODE} --disallowedTools {DENIED_TOOLS}"
        f" --model {MODEL}"
        f" > {shlex.quote(str(log))} 2>&1;"
        f" echo exit=$? >> {shlex.quote(str(log))};"
        f" rm -f {shlex.quote(str(SENTINEL))}"
    )
    with contextlib.suppress(OSError):
        _ = subprocess.Popen(
            ["sh", "-c", command],
            cwd=str(root),
            start_new_session=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def _tail_lines(path: Path) -> list[str]:
    """The closing lines. The slice can start mid-character, so the first line comes back
    partial; callers match within a line rather than anchoring at its start."""
    try:
        with path.open("rb") as handle:
            _ = handle.seek(0, os.SEEK_END)
            _ = handle.seek(max(0, handle.tell() - TAIL_BYTES))
            tail = handle.read()
    except OSError:
        return []
    return tail.decode("utf-8", errors="replace").splitlines()


def _failures() -> str | None:
    """One line naming the runs that ended nonzero, or None when every run ended at 0.

    A detached child leaves no transcript, so a run that dies shows up neither in the
    conversation nor in `git diff`. The log is the only path by which the write silently
    stopping gets noticed, and a run counts as failed unless it closed with the report line the
    prompt asks for. Each log is renamed once reported, so one failure is not repeated every
    session.

    Pruning runs/ belongs here rather than in _claim, whose loop drops files by their own mtime
    and cannot unlink a directory.
    """
    failed: list[str] = []
    cutoff = _stale_before()
    try:
        runs = sorted(RUNS.iterdir())
    except OSError:
        return None
    for run in runs:
        try:
            stale = run.stat().st_mtime < cutoff
        except OSError:
            continue
        if stale:
            shutil.rmtree(run, ignore_errors=True)
            continue
        log = run / "log.txt"
        if not log.is_file():
            continue
        lines = _tail_lines(log)
        # A run still in flight carries no exit line, because the wrapper appends it only once
        # the child returns. Skipping it is what keeps a child from reporting its own parent.
        if not lines or not lines[-1].startswith("exit="):
            continue
        if lines[-1] != "exit=0" or not any(REPORT.search(line) for line in lines):
            failed.append(run.name[:8])
        with contextlib.suppress(OSError):
            _ = log.rename(run / "log.seen.txt")
    if not failed:
        return None
    return (
        f"reflection_ask: {len(failed)} 件の追記が失敗しました "
        f"({', '.join(failed)})。{RUNS} のログを読んでください"
    )


def main() -> None:
    payload = parse(sys.stdin.read())
    session_id = payload.get("session_id")
    cwd = payload.get("cwd")
    if not isinstance(session_id, str) or not session_id:
        return
    if not isinstance(cwd, str) or not cwd:
        return

    # Resolved before the mark is written, so a session that starts outside git is still
    # handled once it moves into a repository.
    root = _repo_root(cwd)
    if root is None:
        return
    corrections = root / ".claude" / "rules" / "CORRECTIONS.md"

    notice = _failures()
    if _claim(session_id) and _hold_spawn():
        transcript = payload.get("transcript_path")
        message = _message(corrections, transcript if isinstance(transcript, str) else "")
        if message is not None:
            _spawn(root, session_id, message)

    # systemMessage rather than additionalContext: the person reading the terminal is the one
    # who can act, and the model's context is what detaching the run exists to spare.
    if notice is not None:
        print(
            json.dumps(
                {"suppressOutput": True, "systemMessage": notice},
                ensure_ascii=False,
            )
        )


if __name__ == "__main__":
    main()
