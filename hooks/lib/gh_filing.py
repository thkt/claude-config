"""What a `gh issue create` or `gh pr create` names on its own command line.

Two PreToolUse hooks read the same filing, so gh's flag spellings are one piece of knowledge:
a hook that knows only `--body-file` denies a correct `-F` filing with a reason that names the
wrong problem.

Read from the filing's own tokens, never from every command on the line: a `--body-file`
belonging to some other command names a different file, and inspecting it under the issue's
name reports on the wrong text.

`ValueError` from the scan reaches the caller. One hook stays silent on quoting it cannot
split while the other denies the filing, so swallowing it here would turn that deny into a
silent pass.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this module loadable there.
from __future__ import annotations

from pathlib import Path
from typing import Literal, NamedTuple

import command_scan

TITLE_FLAGS = ("--title", "-t")
BODY_FLAGS = ("--body", "-b")
BODY_FILE_FLAGS = ("--body-file", "-F")

Kind = Literal["issue", "pr"]
KINDS: tuple[Kind, ...] = ("issue", "pr")


class Filing(NamedTuple):
    tokens: list[str]
    kind: Kind
    directory: Path


def find(command: str, kind: Kind | None = None) -> Filing | None:
    """The filing a command line runs, or None when it runs none of the requested kind.

    `directory` follows every cd ahead of the filing, since `cd a && cd b` lands in a/b and a
    relative body path resolves against that.
    """
    directory = Path.cwd()
    for tokens in command_scan.commands(command):
        if tokens[0] == "cd" and len(tokens) > 1:
            directory = directory / tokens[1]
            continue
        for name in KINDS:
            if kind in (None, name) and command_scan.starts_with(tokens, ["gh", name, "create"]):
                return Filing(tokens, name, directory)
    return None


def flag(filing: Filing, names: tuple[str, ...]) -> str | None:
    """The value the filing carries under any of the given spellings."""
    for name in names:
        value = command_scan.flag_value(filing.tokens, name)
        if value:
            return value
    return None


def body_file(filing: Filing) -> Path | None:
    """Where the filing's `--body-file` points, resolved against the directory it runs in.

    Returned whether or not it exists, since the caller decides what an unreadable body means.
    """
    named = flag(filing, BODY_FILE_FLAGS)
    if not named:
        return None
    path = Path(named)
    return path if path.is_absolute() else filing.directory / path
