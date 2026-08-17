#!/usr/bin/env python3
"""PreToolUse hook: stop tree-rewriting git commands from running sandboxed in the Claude
config directory.

The sandbox denies Bash writes under agents/ rules/ skills/ hooks/ commands/ workflows/ even
when settings.json lists them in sandbox.filesystem.allowWrite. git moves HEAD anyway, so the
tree is left with HEAD on one commit and those directories on another, and the next pull
refuses to run because the tree reads as dirty.

Failure mode: fail-closed. A line shlex cannot tokenize hides where its git call sits, so it
is not cleared.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this file loadable there.
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

import command_scan
from hook_payload import deny, field, parse

# Subcommands that reach the working tree. Most move the index and leave the file behind
# under the sandbox; checkout-index and read-tree go the other way, writing the tree from an
# index the sandbox never blocked.
REWRITES = frozenset({
    "checkout", "switch", "restore", "pull", "merge", "rebase", "revert",
    "cherry-pick", "stash", "am", "apply", "clean", "reset",
    "rm", "mv", "sparse-checkout", "bisect", "checkout-index", "read-tree",
    "filter-branch",
})

# Printing the usage reaches no file, whichever subcommand it is asked of.
HELP = frozenset({"--help", "-h"})

# git reads everything past this as a path, so a file named `-h` is not a request for help.
PATH_SEPARATOR = "--"

# Flags that keep a subcommand off the tree. checkout takes -b / -B and switch takes -c / -C,
# and creating a branch leaves every file where it is. -n / --dry-run only prints, --cached
# stops at the index, and git apply reads the patch without laying it down.
READ_FLAGS = {
    "checkout": frozenset({"-b", "-B"}),
    "switch": frozenset({"-c", "-C"}),
    "rm": frozenset({"--cached", "-n", "--dry-run"}),
    "mv": frozenset({"-n", "--dry-run"}),
    "apply": frozenset({"--check", "--stat", "--numstat", "--summary"}),
    "rebase": frozenset({"--show-current-patch"}),
}

# The mirror of the above: these subcommands stop short of the tree unless a flag carries them
# into it. reset --soft and --mixed end at the index, and read-tree loads it without unpacking.
WRITE_FLAGS = {
    "reset": frozenset({"--hard", "--merge", "--keep"}),
    "read-tree": frozenset({"-u"}),
}

# A first argument that only reads. Every other step of these subcommands checks something out
# or rewrites which files are present.
READ_ARGUMENTS = {
    "stash": frozenset({"list", "show", "drop", "clear"}),
    "sparse-checkout": frozenset({"list"}),
    "bisect": frozenset({"log", "view", "visualize", "terms"}),
}

REASON = (
    "git-sandbox-guard: このリポジトリで作業ツリーを書き換える git は sandbox 内で走らせない。"
    "agents/ rules/ skills/ hooks/ commands/ workflows/ への書き込みが拒否され、"
    "HEAD だけ進んで作業ツリーと食い違う。"
    "dangerouslyDisableSandbox: true を付けて同じコマンドを実行し直す。"
    "それも拒否されたら、ユーザーに `! <コマンド>` での実行を依頼する。"
)



def _clean_only_lists(rest: list[str]) -> bool:
    """Whether a git clean call prints its targets instead of removing them."""
    for arg in rest:
        if arg == "--dry-run":
            return True
        # Short flags combine, so the dry-run bit arrives inside -nd as well as alone.
        if arg.startswith("-") and not arg.startswith("--") and "n" in arg:
            return True
    return False


def _flags(rest: list[str]) -> list[str]:
    """The arguments up to the path separator. What follows names files, and reading those as
    flags would let `git rm -- -h` pass as a request for help."""
    return rest[: rest.index(PATH_SEPARATOR)] if PATH_SEPARATOR in rest else rest


def _rewrites_tree(tokens: list[str]) -> bool:
    # -C names another repository, which this guard denies rather than resolves: the escape
    # hatch would be one flag away and the miss would be silent.
    subcommand, rest = command_scan.git_subcommand(tokens)
    if subcommand not in REWRITES:
        return False

    rest = _flags(rest)
    if any(a in HELP for a in rest):
        return False
    if subcommand in READ_FLAGS:
        return not any(a in READ_FLAGS[subcommand] for a in rest)
    if subcommand in WRITE_FLAGS:
        return any(a in WRITE_FLAGS[subcommand] for a in rest)
    if subcommand in READ_ARGUMENTS:
        return not (rest and rest[0] in READ_ARGUMENTS[subcommand])
    if subcommand == "clean":
        return not _clean_only_lists(rest)
    if subcommand == "restore":
        # --staged alone rewrites the index. Paired with --worktree it reaches the tree too.
        return "--worktree" in rest or "--staged" not in rest
    return True


def rewrites(command: str) -> bool:
    """Whether the command line writes tracked files in the working tree.

    Not a regex over the raw string: it cannot tell where a token sits, so `git pull` inside a
    commit message would read as a pull.
    """
    try:
        return any(
            c[0] == "git" and _rewrites_tree(c) for c in command_scan.commands(command)
        )
    except ValueError:
        return True


def _guarded_root() -> Path | None:
    """The config directory the sandbox protects. CLAUDE_CONFIG_DIR relocates it, and the
    physical path is what rev-parse reports back."""
    named = os.environ.get("CLAUDE_CONFIG_DIR") or str(Path.home() / ".claude")
    try:
        return Path(named).resolve(strict=True)
    except OSError:
        return None


def _toplevel(cwd: str) -> Path | None:
    result = subprocess.run(
        ["git", "-C", cwd, "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    return Path(result.stdout.strip())


def main() -> None:
    raw = sys.stdin.read()
    if "git" not in raw:
        return

    payload = parse(raw)
    tool_input = payload.get("tool_input")
    # The caller already turned the sandbox off, so the writes this guard protects will land.
    if field(tool_input, "dangerouslyDisableSandbox") is True:
        return

    command = field(tool_input, "command")
    if not isinstance(command, str) or not command:
        return
    # Decided before rev-parse is forked: most payloads carrying the letters `git` run no git
    # at all, and the scan answers that without starting a process.
    if not rewrites(command):
        return

    guarded = _guarded_root()
    if guarded is None:
        return
    cwd = payload.get("cwd")
    # A repository checked out anywhere else writes freely, so only this one needs the guard.
    if _toplevel(cwd if isinstance(cwd, str) and cwd else os.getcwd()) != guarded:
        return
    deny(REASON)


if __name__ == "__main__":
    main()
