"""The scribe trigger a command line runs, if any.

scribe reads its scope from merged PRs and closed issues (skills/scribe/SKILL.md), so a
`gh pr merge` or a `gh issue close` is what grows its input.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Literal, NamedTuple

import command_scan

Kind = Literal["issue", "pr"]

# A gh invocation, injected so tests hand over canned stdout instead of a live gh process.
GhRunner = Callable[[Sequence[str]], str]

# The interval a stamp counts as recent, in the shape hooks/lifecycle/recall_index.py's
# WINDOW_MINUTES takes. A nudge costs the user's attention, not just gh's rate limit, so the
# window is a workday: whichever command trips the trigger again inside it should stay quiet
# rather than repeat a suggestion the user already saw once today.
WINDOW_MINUTES = 8 * 60

# The subcommand path that closes each kind, in the order find checks them.
CLOSERS: tuple[tuple[Kind, tuple[str, ...]], ...] = (
    ("pr", ("gh", "pr", "merge")),
    ("issue", ("gh", "issue", "close")),
)


class Trigger(NamedTuple):
    kind: Kind
    directory: Path


def find(command: str) -> Trigger | None:
    """The scribe trigger a command line runs, or None when it runs none.

    `directory` follows every cd ahead of the trigger, since `cd a && cd b` lands in a/b and
    the repository scribe should run in is the one the trigger command runs in.

    A `--repo owner/name` names a repository other than the one this session works in, so its
    backlog is not what a nudge here would send anyone to. Such a trigger returns None.
    """
    directory = Path.cwd()
    for tokens in command_scan.commands(command):
        if tokens[0] == "cd" and len(tokens) > 1:
            directory = directory / tokens[1]
            continue
        for kind, prefix in CLOSERS:
            if command_scan.starts_with(tokens, prefix):
                if command_scan.flag_value(tokens, "--repo"):
                    return None
                return Trigger(kind, directory)
    return None


def _default_runner(directory: Path) -> GhRunner:
    """gh runs with the trigger's directory as cwd, so it reads the repository off that
    checkout's git remote rather than off wherever the hook process started."""

    def run(args: Sequence[str]) -> str:
        result = subprocess.run(
            ["gh", *args],
            cwd=directory,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout

    return run


def _default_stamp() -> Path:
    return Path.home() / ".cache" / "claude-scribe_trigger.last"


def _recently_stamped(stamp: Path) -> bool:
    try:
        return time.time() - stamp.stat().st_mtime < WINDOW_MINUTES * 60
    except OSError:
        return False


def _touch(stamp: Path) -> None:
    """A stamp that fails to write silently turns the cooldown off, which is the shape DR-0097
    was removed for. Report it instead."""
    try:
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.touch()
    except OSError as exc:
        print(f"scribe_trigger: cooldown stamp not written ({exc})", file=sys.stderr)


def _unmerged_scribe_pr_exists(call: GhRunner) -> bool:
    """skills/scribe/SKILL.md Phase 1 step 1: an open scribe PR already covers the backlog,
    so a second nudge would only invite a second run to collide with it."""
    output = call(["pr", "list", "--label", "scribe", "--state", "open", "--json", "number"])
    return len(json.loads(output)) > 0


def _last_scribe_merge(call: GhRunner) -> str:
    """skills/scribe/SKILL.md Phase 2 step 1: the mergedAt of the last merged scribe PR, empty
    when none has ever merged. `-q` hands back the bare value, not a JSON-quoted string."""
    return call(
        [
            "pr",
            "list",
            "--label",
            "scribe",
            "--state",
            "merged",
            "--limit",
            "1",
            "--json",
            "mergedAt",
            "-q",
            ".[0].mergedAt",
        ]
    ).strip()


def _has_new_input(trigger: Trigger, cursor: str, call: GhRunner) -> bool:
    """skills/scribe/SKILL.md Phase 2 steps 2-3. Both kinds count toward the backlog, so a
    merge that lands while three issues sit unread still has input waiting.

    The trigger's own kind goes first and returns on the first hit, which spends one gh call
    on the common case rather than two.
    """
    order: tuple[Kind, ...] = ("pr", "issue") if trigger.kind == "pr" else ("issue", "pr")
    for kind in order:
        if kind == "pr":
            search = f"-label:scribe merged:>{cursor}" if cursor else "-label:scribe"
            args = ["pr", "list", "--state", "merged", "--search", search, "--json", "number"]
        else:
            args = ["issue", "list", "--state", "closed", "--json", "number"]
            if cursor:
                args += ["--search", f"closed:>{cursor}"]
        if len(json.loads(call(args))) >= 1:
            return True
    return False


def should_prompt(
    trigger: Trigger,
    *,
    stamp: Path | None = None,
    runner: GhRunner | None = None,
) -> bool:
    """Each gate returns before the gh call the next one would spend, so the order is what
    keeps the common case to a single call."""
    if not (trigger.directory / "docs" / "wiki").is_dir():
        return False
    call = runner or _default_runner(trigger.directory)
    if _unmerged_scribe_pr_exists(call):
        return False
    cursor = _last_scribe_merge(call)
    if not _has_new_input(trigger, cursor, call):
        return False
    stamp_path = stamp or _default_stamp()
    if _recently_stamped(stamp_path):
        return False
    _touch(stamp_path)
    return True
