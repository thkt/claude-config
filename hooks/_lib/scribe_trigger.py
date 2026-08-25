"""The scribe trigger a command line runs, if any.

scribe reads its scope from merged PRs and closed issues (skills/scribe/SKILL.md), so the
command that starts a scribe run is a `gh pr merge` or a `gh issue close`. Read from where each
token sits, the same way hooks/_lib/gh_filing.py finds a filing: a `gh issue close` sitting
inside a quoted argument or a loop body is not itself a command the line runs.
"""

from __future__ import annotations

import json
import subprocess
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
    the repository scribe should run in is the one the trigger command runs in. A `--repo` on
    the trigger itself overrides that: gh resolves `--repo owner/name` regardless of cwd, so
    the trigger command's own flag outranks any cd that came before it.
    """
    directory = Path.cwd()
    for tokens in command_scan.commands(command):
        if tokens[0] == "cd" and len(tokens) > 1:
            directory = directory / tokens[1]
            continue
        for kind, prefix in CLOSERS:
            if command_scan.starts_with(tokens, prefix):
                repo = command_scan.flag_value(tokens, "--repo")
                return Trigger(kind, Path(repo) if repo else directory)
    return None


def _default_runner(directory: Path) -> GhRunner:
    """gh scoped to the trigger's own directory, the way `find`'s `--repo` handling and
    `cd`-following already resolve it: a local checkout runs with that cwd so gh infers the
    repository from its git remote, and a `--repo owner/name` value works the same way gh
    itself accepts a relative path only when one exists at that name under cwd.
    """

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
    try:
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.touch()
    except OSError:
        pass


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


def _new_input_count(trigger: Trigger, cursor: str, call: GhRunner) -> int:
    """skills/scribe/SKILL.md Phase 2 steps 2-3, narrowed to the trigger's own kind: the hook
    fires once per completed `gh pr merge`/`gh issue close`, so checking only that kind's
    backlog keeps this to the one gh call cooldown gating can afford. The kind this trigger did
    not touch gets picked up the next time a command of that kind fires.
    """
    if trigger.kind == "pr":
        search = f"-label:scribe merged:>{cursor}" if cursor else "-label:scribe"
        args = ["pr", "list", "--state", "merged", "--search", search, "--json", "number"]
    else:
        args = ["issue", "list", "--state", "closed", "--json", "number"]
        if cursor:
            args += ["--search", f"closed:>{cursor}"]
    return len(json.loads(call(args)))


def should_prompt(
    trigger: Trigger,
    *,
    stamp: Path | None = None,
    runner: GhRunner | None = None,
) -> bool:
    """Whether a completed trigger is worth nudging the user toward a scribe run.

    scribe extracts its patterns into docs/wiki/ (skills/scribe/SKILL.md), so a target that
    holds no docs/wiki/ at all is not set up to receive that output yet. Past that, three gates
    hold: an unmerged scribe PR already covers the backlog, nothing new has landed since the
    last scribe merge, and a stamp from a recent nudge is still within its cooldown. Each gate
    that closes returns before the gh call the next one would spend, so a decision that stops
    early never pays for an answer it no longer needs.
    """
    if not (trigger.directory / "docs" / "wiki").is_dir():
        return False
    call = runner or _default_runner(trigger.directory)
    if _unmerged_scribe_pr_exists(call):
        return False
    cursor = _last_scribe_merge(call)
    if _new_input_count(trigger, cursor, call) < 1:
        return False
    stamp_path = stamp or _default_stamp()
    if _recently_stamped(stamp_path):
        return False
    _touch(stamp_path)
    return True
