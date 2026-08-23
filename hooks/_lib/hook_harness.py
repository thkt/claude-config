"""Shared invocation for the hook tests.

Each hook test builds its own payload, because the tool names and fields differ per hook. What
they share is running the hook as a subprocess and reading its stdout. Copied per file, that
invocation dropped the same thing seven times over: the exit status. A hook that dies before
writing anything hands back an empty string, and every "is not a deny" assertion accepts it.

Imported from tests alone, following the shared-harness placement `../conventions/WORKFLOWS.md`
sets for `workflows/_lib/`.
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections.abc import Sequence
from pathlib import Path

# Long enough to cover a hook that waits on a bounded probe of its own, short enough that a
# hook which never returns fails the suite instead of hanging it.
TIMEOUT_SECONDS = 60


def completed(
    hook: Path,
    payload: object,
    env: dict[str, str] | None = None,
    args: Sequence[str] = (),
) -> subprocess.CompletedProcess[str]:
    """The whole result, for a test that reads the exit status or stderr itself.

    env replaces the environment rather than extending it, because a test that strips PATH to
    make a tool unreachable needs the replacement. A caller wanting the rest of the environment
    passes `dict(os.environ, ...)`, which is what the merge would have done anyway.
    """
    return subprocess.run(
        [sys.executable, str(hook), *args],
        input=payload if isinstance(payload, str) else json.dumps(payload),
        capture_output=True,
        text=True,
        check=False,
        env=env,
        timeout=TIMEOUT_SECONDS,
    )


def checked(
    hook: Path,
    payload: object,
    env: dict[str, str] | None = None,
    args: Sequence[str] = (),
) -> subprocess.CompletedProcess[str]:
    """The whole result, after confirming the hook ran.

    No hook in this tree exits non-zero by design, so a non-zero status is a broken hook rather
    than a result to assert against.
    """
    result = completed(hook, payload, env, args)
    if result.returncode != 0:
        raise AssertionError(f"{hook.name} exited {result.returncode}: {result.stderr.strip()}")
    return result


def run(
    hook: Path,
    payload: object,
    env: dict[str, str] | None = None,
    args: Sequence[str] = (),
) -> str:
    """The hook's stdout, after confirming it ran."""
    return checked(hook, payload, env, args).stdout
