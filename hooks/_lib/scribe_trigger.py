"""Whether a `git pull` just landed work scribe has not read yet.

scribe reads its scope from merged PRs and closed issues (skills/scribe/SKILL.md). Those close
on GitHub, not on this machine, so the local signal that they happened is the pull that brings
them down.
"""

# python3 on a cut-down PATH can be old enough to reject `X | None` at import time.
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
from pathlib import Path

import command_scan

# A gh invocation, injected so tests hand over canned stdout instead of a live gh process.
GhRunner = Callable[[Sequence[str]], str]

# A hook starts with PATH cut down, so a bare `gh` raises FileNotFoundError before any gate runs.
DEFAULT_GH = Path("/opt/homebrew/bin/gh")

# The interval a stamp counts as recent, in the shape hooks/lifecycle/recall_index.py's
# WINDOW_MINUTES takes. A nudge costs the user's attention, not just gh's rate limit, so the
# window is a workday: whichever pull trips the trigger again inside it should stay quiet
# rather than repeat a suggestion the user already saw once today.
WINDOW_MINUTES = 8 * 60


def find(command: str) -> Path | None:
    """The directory a `git pull` runs in, or None when the line runs none.

    `directory` follows every cd ahead of the pull, since `cd a && cd b` lands in a/b and the
    repository scribe should run in is the one the pull runs in.
    """
    directory = Path.cwd()
    for tokens in command_scan.commands(command):
        if tokens[0] == "cd" and len(tokens) > 1:
            directory = directory / tokens[1]
            continue
        if command_scan.starts_with(tokens, ["git", "pull"]):
            return directory
    return None


def _default_runner(directory: Path, gh: Path) -> GhRunner:
    """gh runs with the pull's directory as cwd, so it reads the repository off that
    checkout's git remote rather than off wherever the hook process started."""

    def run(args: Sequence[str]) -> str:
        result = subprocess.run(
            [str(gh), *args],
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


def _has_new_input(cursor: str, call: GhRunner) -> bool:
    """skills/scribe/SKILL.md Phase 2 steps 2-3. Returns on the first kind that has anything,
    so a backlog carrying merged PRs costs one gh call rather than two."""
    search = f"-label:scribe merged:>{cursor}" if cursor else "-label:scribe"
    prs = ["pr", "list", "--state", "merged", "--search", search, "--json", "number"]
    if len(json.loads(call(prs))) >= 1:
        return True
    issues = ["issue", "list", "--state", "closed", "--json", "number"]
    if cursor:
        issues += ["--search", f"closed:>{cursor}"]
    return len(json.loads(call(issues))) >= 1


def should_prompt(
    directory: Path,
    *,
    stamp: Path | None = None,
    runner: GhRunner | None = None,
    gh: Path | None = None,
) -> bool:
    """The cooldown comes before the gh calls because a pull runs far more often than a merge
    lands: most pulls inside one window have nothing new to find, and asking GitHub each time
    would spend a round trip to learn that."""
    if not (directory / "docs" / "wiki").is_dir():
        return False
    stamp_path = stamp or _default_stamp()
    if _recently_stamped(stamp_path):
        return False
    binary = gh or Path(os.environ.get("CLAUDE_GH_BIN") or DEFAULT_GH)
    if runner is None and not (binary.is_file() and os.access(binary, os.X_OK)):
        return False
    call = runner or _default_runner(directory, binary)
    try:
        if _unmerged_scribe_pr_exists(call):
            return False
        if not _has_new_input(_last_scribe_merge(call), call):
            return False
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError):
        # None of these say a backlog is waiting, and raising here would report a hook error
        # on a plain pull.
        return False
    _touch(stamp_path)
    return True
