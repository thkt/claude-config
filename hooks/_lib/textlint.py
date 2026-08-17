"""Shared textlint invocation for the fix and lint hooks.

Both hooks resolve the same config, pick the same runner, and have to run from the config's
directory. Only what they do with the result differs.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this module loadable there.
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

# Not $HOME/.claude, which names the installed harness alone: a checkout run from anywhere
# else finds no config there.
REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG = REPO_ROOT / ".textlintrc.json"


def _runner() -> list[str] | None:
    if shutil.which("bun"):
        return ["bun", "x"]
    if shutil.which("npx"):
        return ["npx"]
    return None


def _run(args: list[str]) -> subprocess.CompletedProcess[str] | None:
    """None when textlint cannot run at all: no config, or no runner to start it with."""
    if not CONFIG.is_file():
        return None
    runner = _runner()
    if runner is None:
        return None
    # cwd, not --config alone: textlint resolves its presets from the working directory and
    # exits 1 from anywhere without node_modules above it, config or no config. That same
    # exit code is how it reports findings, so check stays False and the callers read stdout.
    return subprocess.run(
        [*runner, "textlint", *args, "--config", str(CONFIG)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def fix(path: str) -> None:
    # The result goes unread: the caller runs after the edit landed, so a textlint failure
    # has nothing left to stop.
    _ = _run(["--fix", path])


def lint(path: str) -> str:
    """The findings, empty when textlint found none or could not run. The caller cannot tell
    the two apart, and neither leaves it anything to report."""
    result = _run([path])
    return result.stdout if result is not None else ""
