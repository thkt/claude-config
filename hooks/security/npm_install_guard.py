#!/usr/bin/env python3
"""PreToolUse hook: block a package install when ignore-scripts is not configured.

The decision value has to be one of allow / deny / ask / defer. Anything else fails schema
validation, which Claude Code reports as a non-blocking hook error before running the tool
call, so a gate written with an invalid value stops nothing.

Failure mode: fail-closed (security enforcement).
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this file loadable there.
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))

import command_scan
from hook_payload import deny, field, parse

MANAGERS = frozenset({"npm", "pnpm", "yarn", "bun"})
INSTALLS = frozenset({"install", "i", "ci", "add", "update", "up", "upgrade"})

# What package_manager_rewrite.py rewrites the managers into, so the same gate has to cover them
# or the rewrite becomes the way around this one.
NI_INSTALLS = frozenset({"ni", "nci", "nup"})

# Fetch-and-run: the package and its dependencies are installed before the bin runs.
RUNNERS = frozenset({"npx", "bunx", "nlx"})

# The same fetch-and-run written as a subcommand of a manager.
FETCH_AND_RUN = frozenset({"dlx", "exec", "x"})

SUBCOMMANDS = INSTALLS | FETCH_AND_RUN

# Read from the command line, these turn the setting back off, and the command line wins over
# .npmrc.
OVERRIDES = frozenset({"--no-ignore-scripts", "--ignore-scripts=false"})

# npm options that swallow the token after them, which would otherwise read as the subcommand
# (`npm --prefix /tmp install` would resolve to /tmp).
VALUED_NPM_FLAGS = frozenset({"--prefix", "-C", "--registry", "-w", "--workspace"})

# Matched anywhere in the payload rather than at its head, since an install written after a
# `cd` or on a second line installs the same way. `ni` carries its delimiters so the two
# letters do not match inside another word.
TRIGGERS = ("npm", "npx", "pnpm", "yarn", "bun", "nlx", "nci", "nup", " ni", '"ni')

REASONS = {
    "unparsable": (
        "npm-safe-install: 引用符が閉じておらずコマンドを解析できない。引用符を閉じて再試行する"
    ),
    "override": (
        "npm-safe-install: --ignore-scripts=false / --no-ignore-scripts は .npmrc の設定を"
        "打ち消し、依存の install script が任意のコードを実行できる。"
        "このフラグを外して再試行する。"
    ),
    "install": (
        "npm-safe-install: ignore-scripts=true が有効でなく、依存の install script が"
        "任意のコードを実行できる。"
        "echo 'ignore-scripts=true' >> ~/.npmrc を実行してから再試行する。"
        "走らせる先の .npmrc が false で打ち消しているなら、そちらを直す。"
    ),
}



def _installs(tokens: list[str]) -> bool:
    if tokens[0] in NI_INSTALLS or tokens[0] in RUNNERS:
        return True
    if tokens[0] not in MANAGERS:
        return False
    return command_scan.subcommand(tokens, VALUED_NPM_FLAGS)[0] in SUBCOMMANDS


def _target(command: str) -> tuple[str, Path] | None:
    """Which verdict the command line earns and where it would run, or None when it installs
    nothing.

    Not the first token of the raw string: `cd /tmp && npm install` reads as `cd`, and the two
    spaces in `npm  install` leave the subcommand empty. The directory follows every cd ahead
    of the install, since `cd a && cd b` lands in a/b and the .npmrc there is the one npm will
    read.
    """
    directory = Path.cwd()
    found: list[list[str]] = []
    try:
        for tokens in command_scan.commands(command):
            if tokens[0] == "cd" and len(tokens) > 1:
                directory = directory / tokens[1]
            elif _installs(tokens):
                found.append(tokens)
    except ValueError:
        return "unparsable", directory  # an unclosed quote hides which flags the install carries
    if not found:
        return None
    override = any(a in OVERRIDES for c in found for a in c)
    return "override" if override else "install", directory


def _setting(npmrc: Path) -> bool | None:
    """What one .npmrc says about ignore-scripts, or None when it says nothing.

    Whitespace around the `=` is allowed, since npm reads `ignore-scripts = true` as true. A
    value in any other spelling, `TRUE` among them, is not a boolean to npm either, so it
    counts as unset here for the same reason.
    """
    try:
        lines = npmrc.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return None
    answer = None
    for line in lines:
        name, sep, value = line.partition("=")
        if sep and name.strip() == "ignore-scripts":
            answer = value.strip() == "true"
    return answer


def _configured(directory: Path) -> bool:
    """Whether install scripts are off where the command will run.

    The project's .npmrc wins over the home one, following npm's own order. A home that turns
    scripts off is undone by a project that turns them back on.
    """
    project = _setting(directory / ".npmrc")
    return project if project is not None else bool(_setting(Path.home() / ".npmrc"))


def main() -> None:
    raw = sys.stdin.read()
    if not any(word in raw for word in TRIGGERS):
        return

    command = field(parse(raw).get("tool_input"), "command")
    if not isinstance(command, str) or not command:
        return

    target = _target(command)
    if target is None:
        return
    verdict, directory = target
    if verdict == "install" and _configured(directory):
        return
    deny(REASONS[verdict])


if __name__ == "__main__":
    main()
