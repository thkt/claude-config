#!/usr/bin/env python3
"""PreToolUse hook: rewrite a package manager command into its ni equivalent.

The ni family resolves the manager from the lockfile, so one spelling keeps working in a
repository that switches managers later.

Advisory: the decision is always allow, and an unrecognised command is left untouched.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this file loadable there.
from __future__ import annotations

import json
import sys
from pathlib import Path
from shutil import which

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

from hook_payload import field, parse

MANAGERS = frozenset({"npm", "npx", "pnpm", "yarn", "bun", "bunx"})


def convert(parts: list[str]) -> str:
    """The ni equivalent of an already-split command, empty for one to leave alone."""
    manager, rest = parts[0], parts[1:]

    if manager in ("npx", "bunx"):
        return f"nlx {' '.join(rest)}" if rest else ""
    if not rest:
        return "ni"

    subcmd, args = rest[0], " ".join(rest[1:])
    # `na --version` answers with ni's own version rather than the manager's, so a flag must
    # not reach the subcommand table below.
    if subcmd.startswith("-"):
        return ""
    # bun's built-in test runner, which is not the package.json script `nr test` would run.
    if manager == "bun" and subcmd in ("test", "t"):
        return ""

    if subcmd in ("install", "i", "add"):
        return f"ni {args}" if args else "ni"
    if subcmd == "ci":
        return "nci"
    if subcmd == "run":
        return f"nr {args}" if args else ""
    if subcmd in ("test", "t"):
        return f"nr test {args}" if args else "nr test"
    if subcmd == "start":
        return f"nr start {args}" if args else "nr start"
    if subcmd in ("exec", "dlx", "x"):
        return f"nlx {args}" if args else ""
    if subcmd in ("uninstall", "remove", "rm", "un"):
        return f"nun {args}" if args else ""
    if subcmd in ("update", "up", "upgrade"):
        return f"nup {args}" if args else "nup"
    # na passes the subcommand to the detected agent verbatim, so a manager-specific one such
    # as `bun pm ls` still reaches the manager that understands it.
    return f"na {subcmd} {args}" if args else f"na {subcmd}"


def main() -> None:
    if which("ni") is None:
        return

    command = field(parse(sys.stdin.read()).get("tool_input"), "command")
    if not isinstance(command, str):
        return
    parts = command.split()
    if not parts or parts[0] not in MANAGERS:
        return

    rewritten = convert(parts)
    if not rewritten:
        return

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "allow",
                    "permissionDecisionReason": (
                        f"auto-package-manager: {parts[0]} → {rewritten.split()[0]}"
                    ),
                    "updatedInput": {"command": rewritten},
                }
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
