"""Shared .rs handling for the rust-*-edit hooks.

settings.json narrows both hooks to .rs paths with an `if` condition. target() repeats the
suffix check so the module still holds when called directly, as the tests do.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this module loadable there.
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from hook_payload import edited_file

# How many findings reach the context. clippy covers the whole workspace, so the edited
# file's own findings move to the front before this cut drops the rest.
MAX_FINDINGS = 40


def target(payload_text: str) -> tuple[Path, Path] | None:
    """The cargo workspace root and the edited file, or None when cargo has nothing to do."""
    path = edited_file(payload_text)
    if path is None or not path.endswith(".rs"):
        return None
    file = Path(path)
    result = subprocess.run(
        ["git", "-C", str(file.parent), "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    return Path(result.stdout.strip()), file


def _findings(root: Path, file: Path) -> str:
    # git prints the root as a real path while the payload may carry a symlinked one, so
    # comparing the two as given leaves the path unrelativized. The name alone still matches
    # most findings, and losing the sort beats raising out of a hook.
    try:
        relative = str(file.resolve().relative_to(root.resolve()))
    except ValueError:
        relative = file.name
    # short format so the cut counts findings, not the source excerpts the default format
    # wraps around each one.
    result = subprocess.run(
        ["cargo", "clippy", "--message-format", "short", "--color", "never"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    lines = (result.stdout + result.stderr).splitlines()
    edited = [line for line in lines if relative in line]
    others = [line for line in lines if relative not in line]
    return "\n".join((edited + others)[:MAX_FINDINGS])


def clippy_output(event: str, root: Path, file: Path) -> str | None:
    """The hook JSON for a clippy run, or None when clippy found nothing to say.

    Nothing to say beats an empty additionalContext, which costs the reader a turn.
    """
    findings = _findings(root, file)
    if not findings.strip():
        return None
    return json.dumps(
        {
            "hookSpecificOutput": {
                "hookEventName": event,
                "additionalContext": findings,
            }
        },
        ensure_ascii=False,
    )


def fmt(root: Path) -> None:
    # The result goes unread: the edit already landed, so a cargo fmt failure has nothing
    # left to stop.
    _ = subprocess.run(["cargo", "fmt"], cwd=root, capture_output=True, check=False)
