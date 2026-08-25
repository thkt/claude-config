"""The scribe trigger a command line runs, if any.

scribe reads its scope from merged PRs and closed issues (skills/scribe/SKILL.md), so the
command that starts a scribe run is a `gh pr merge` or a `gh issue close`. Read from where each
token sits, the same way hooks/_lib/gh_filing.py finds a filing: a `gh issue close` sitting
inside a quoted argument or a loop body is not itself a command the line runs.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal, NamedTuple

import command_scan

Kind = Literal["issue", "pr"]

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


def should_prompt(trigger: Trigger) -> bool:
    """Whether a completed trigger is worth nudging the user toward a scribe run.

    scribe extracts its patterns into docs/wiki/ (skills/scribe/SKILL.md), so a target that
    holds no docs/wiki/ at all is not set up to receive that output yet.
    """
    return (trigger.directory / "docs" / "wiki").is_dir()
