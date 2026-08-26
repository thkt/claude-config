"""Whether scribe has anything new to read, decided the way should_prompt decides it.

Unlike should_prompt, no docs/wiki check and no cooldown stamp: a CI run fires once per
invocation, not once per pull, and the repository it runs in always has docs/wiki.
"""

# python3 on a cut-down PATH can be old enough to reject `X | None` at import time.
from __future__ import annotations

import json
import os
import subprocess
import sys
from collections.abc import Sequence
from pathlib import Path

import scribe_trigger
from scribe_trigger import GhRunner


def _default_runner(gh: Path) -> GhRunner:
    def run(args: Sequence[str]) -> str:
        result = subprocess.run(
            [str(gh), *args],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout

    return run


def should_run(*, runner: GhRunner | None = None, gh: Path | None = None) -> bool:
    binary = gh or Path(os.environ.get("CLAUDE_GH_BIN") or scribe_trigger.DEFAULT_GH)
    call = runner or _default_runner(binary)
    try:
        if scribe_trigger._unmerged_scribe_pr_exists(call):
            return False
        if not scribe_trigger._has_new_input(scribe_trigger._last_scribe_merge(call), call):
            return False
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError):
        # None of these say a backlog is waiting, and raising here would turn a plain CI run
        # into a failed job over a transient gh problem.
        return False
    return True


def main() -> int:
    result = should_run()
    line = f"should_run={'true' if result else 'false'}\n"
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with Path(output_path).open("a", encoding="utf-8") as handle:
            handle.write(line)
    else:
        sys.stdout.write(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
