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
    the repository scribe should run in is the one the trigger command runs in.
    """
    directory = Path.cwd()
    for tokens in command_scan.commands(command):
        if tokens[0] == "cd" and len(tokens) > 1:
            directory = directory / tokens[1]
            continue
        for kind, prefix in CLOSERS:
            if command_scan.starts_with(tokens, prefix):
                return Trigger(kind, directory)
    return None
