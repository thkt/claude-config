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
import re
import subprocess
import sys
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

import command_scan
from hook_payload import deny, field, parse

# Subcommands that reach the working tree. Most move the index and leave the file behind
# under the sandbox; checkout-index and read-tree go the other way, writing the tree from an
# index the sandbox never blocked.
REWRITES = frozenset(
    {
        "checkout",
        "switch",
        "restore",
        "pull",
        "merge",
        "rebase",
        "revert",
        "cherry-pick",
        "stash",
        "am",
        "apply",
        "clean",
        "reset",
        "rm",
        "mv",
        "sparse-checkout",
        "bisect",
        "checkout-index",
        "read-tree",
        "filter-branch",
    }
)

# Printing the usage reaches no file, whichever subcommand it is asked of.
HELP = frozenset({"--help", "-h"})

# A shell prefix reaches the same repository `--git-dir` and `--work-tree` name, so a guard
# reading only the flags passes `GIT_DIR=<guarded>/.git git checkout main` through.
GIT_ENV = frozenset({"GIT_DIR", "GIT_WORK_TREE"})

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
    + "agents/ rules/ skills/ hooks/ commands/ workflows/ への書き込みが拒否され、"
    + "HEAD だけ進んで作業ツリーと食い違う。"
    + "dangerouslyDisableSandbox: true を付けて同じコマンドを実行し直す。"
    + "それも拒否されたら、ユーザーに `! <コマンド>` での実行を依頼する。"
)

# Not a silent pass: reading "cannot tell" as "not protected" turns the guard off exactly when
# the environment is misconfigured.
UNRESOLVED = (
    "git-sandbox-guard: 保護対象の設定ディレクトリを解決できないため、"
    + "このリポジトリが対象かどうかを判定できない。"
    + "CLAUDE_CONFIG_DIR が指すパスが存在するか、読み取れるかを確認する。"
    + "解決できないまま実行するなら dangerouslyDisableSandbox: true を付ける。"
)

UNRESOLVED_PROBE = (
    "git-sandbox-guard: この呼び出しがどのリポジトリへ届くかを判定できない。"
    + "git が PATH にあるか、対象リポジトリを読めるかを確認する。rev-parse の出力: "
)


# A PreToolUse hook sits in front of the user's command, so a probe that never returns blocks
# the call. On a network filesystem or a repository being repacked, rev-parse can stall.
PROBE_TIMEOUT_SECONDS = 10

# git's own wording for the one failure that means "this is not a repository".
NOT_A_REPOSITORY = re.compile(r"not a git repository|this operation must be run in a work tree")


class Unresolved(Exception):
    """The probe could not answer which repository a call reaches."""


class Target(NamedTuple):
    """Where one git call points itself, in the form the rev-parse probe takes."""

    redirects: tuple[str, ...]
    env: tuple[tuple[str, str], ...]


def _rewrites_tree(tokens: list[str]) -> bool:
    """Whether one git call rewrites the tree.

    -C names another repository, which this guard denies rather than resolves: the escape
    hatch would be one flag away and the miss would be silent.
    """
    subcommand, rest = command_scan.git_subcommand(tokens)
    if subcommand not in REWRITES:
        return False

    rest = command_scan.before_pathspec(rest)
    if any(a in HELP for a in rest):
        return False
    if subcommand in READ_FLAGS:
        return not any(a in READ_FLAGS[subcommand] for a in rest)
    if subcommand in WRITE_FLAGS:
        return any(a in WRITE_FLAGS[subcommand] for a in rest)
    if subcommand in READ_ARGUMENTS:
        return not (rest and rest[0] in READ_ARGUMENTS[subcommand])
    if subcommand == "clean":
        return not command_scan.git_clean_only_lists(rest)
    if subcommand == "restore":
        # --staged alone rewrites the index. Paired with --worktree it reaches the tree too.
        return "--worktree" in rest or "--staged" not in rest
    return True


def rewriting_targets(command: str) -> list[Target]:
    """One target per git call on the line that writes tracked files in the working tree.

    Not a regex over the raw string: it cannot tell where a token sits, so `git pull` inside a
    commit message would read as a pull. Every call is kept, not the first, because
    `git checkout main && git -C <elsewhere> checkout main` reaches two repositories.
    Deduplicated, so the common single-call line still forks rev-parse once.
    """
    targets: list[Target] = []
    try:
        for env, tokens in command_scan.commands_with_env(command):
            if tokens[0] != "git" or not _rewrites_tree(tokens):
                continue
            picked = {name: value for name, value in env.items() if name in GIT_ENV}
            target = Target(_redirects(tokens), tuple(sorted(picked.items())))
            if target not in targets:
                targets.append(target)
    except ValueError:
        # Standing in for the call keeps the guard on the cwd repository, where clearing the
        # line would drop it.
        return [Target((), ())]
    return targets


def _redirects(tokens: list[str]) -> tuple[str, ...]:
    """git's own options, which sit ahead of the subcommand.

    `-C`, `--git-dir`, and `--work-tree` each point the call at a repository other than the one
    cwd sits in. Replayed into the rev-parse probe rather than resolved here, so git's own
    precedence and relative-path rules decide the answer.
    """
    subcommand, rest = command_scan.git_subcommand(tokens)
    if subcommand is None:
        return ()
    return tuple(tokens[1 : len(tokens) - len(rest) - 1])


def _guarded_root() -> Path | None:
    """The config directory the sandbox protects.

    CLAUDE_CONFIG_DIR relocates it, and the physical path is what rev-parse reports back.
    """
    named = os.environ.get("CLAUDE_CONFIG_DIR") or str(Path.home() / ".claude")
    try:
        return Path(named).resolve(strict=True)
    except OSError:
        return None


def _toplevel(cwd: str | Path, redirects: tuple[str, ...], env: dict[str, str]) -> Path | None:
    """The working tree the call reaches, None when git answers that there is none.

    Every other failure raises: a probe that could not run says nothing about where the call
    lands, and reading that as "not the guarded one" turns the guard off.
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(cwd), *redirects, "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            check=False,
            env=dict(os.environ, **env),
            timeout=PROBE_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as expiry:
        raise Unresolved(f"rev-parse did not answer in {PROBE_TIMEOUT_SECONDS}s") from expiry
    if result.returncode == 0 and result.stdout.strip():
        return Path(result.stdout.strip())
    if NOT_A_REPOSITORY.search(result.stderr):
        return None
    raise Unresolved(result.stderr.strip() or f"rev-parse exited {result.returncode}")


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
    targets = rewriting_targets(command)
    if not targets:
        return

    cwd = payload.get("cwd") if isinstance(payload.get("cwd"), str) else None
    guarded = _guarded_root()
    for target in targets:
        try:
            top = _toplevel(cwd or Path.cwd(), target.redirects, dict(target.env))
        except Unresolved as failure:
            deny(f"{UNRESOLVED_PROBE}{failure}")
            return
        # The call reaches no repository, so it rewrites no tree this guard protects.
        if top is None:
            continue
        # Asked after a repository is known, so an unresolvable config directory stops calls
        # inside a repository alone rather than every git on the machine.
        if guarded is None:
            deny(UNRESOLVED)
            return
        # A repository checked out anywhere else writes freely, so only this one needs the guard.
        if top == guarded:
            deny(REASON)
            return


if __name__ == "__main__":
    main()
