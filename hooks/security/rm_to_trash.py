#!/usr/bin/env python3
"""PreToolUse hook: redirect deletion to `mv ~/.Trash/`.

Covers the deletion verbs (rm / rmdir / unlink / shred) plus the two forms that unlink files
while no token on the line names a deletion command: `find -delete` and `git clean`.

Out of scope, deliberately:
  `: > file`      the Write tool overwrites files the same way, so overwriting is not what
                  this hook stops
  `python3 -c`    a deletion inside an interpreter argument is beyond a token scan
  `git rm`        a tracked file is restorable from its commit. git-sandbox-guard denies it
                  for its own reason, the index moving while the unlink is refused

Failure mode: fail-closed (security enforcement).
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this file loadable there.
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

import command_scan
from hook_payload import deny, field, parse

VERBS = frozenset({"rm", "rmdir", "unlink", "shred"})

# The words that can reach a denial. Matched anywhere in the payload rather than at a token
# boundary, since the scan below decides and this only keeps the work off everything else.
# `-delete` is here because `find . -delete` carries no deletion verb.
TRIGGERS = ("rm", "unlink", "shred", "-delete")

REASONS = {
    "find": (
        "rm-to-trash: find -delete はファイルを消す。"
        + "`find ... -exec mv {} ~/.Trash/ \\;` に置き換える。"
    ),
    "clean": (
        "rm-to-trash: git clean は未追跡ファイルを消すので、コミットに復元元が無い。"
        + "`git clean -n` で対象を一覧し、残すものを確かめてから `mv <file> ~/.Trash/` で移す。"
        + "件数が多く 1 つずつ移せないときは、ユーザーに `! git clean -fd` での実行を依頼する。"
    ),
    "verb": (
        "rm-to-trash: 削除は `mv <file> ~/.Trash/ && git add <file>` を使う。"
        + "sandbox が `mv ~/.Trash/` を弾いたら dangerouslyDisableSandbox: true でリトライし、"
        + "他の sandbox エラーはユーザーに報告する。"
    ),
}


def _only_lists(rest: list[str]) -> bool:
    """Whether a git clean call prints its targets instead of removing them."""
    for arg in rest:
        if arg == "--dry-run":
            return True
        # Short flags combine, so the dry-run bit arrives inside -nd as well as alone.
        if arg.startswith("-") and not arg.startswith("--") and "n" in arg:
            return True
    return False


def _deletes(tokens: list[str]) -> str | None:
    """Which form of deletion a command takes, or None when it deletes nothing."""
    if tokens[0] in VERBS:
        return "verb"
    if tokens[0] == "find" and "-delete" in tokens:
        return "find"
    if tokens[0] == "git":
        subcommand, rest = command_scan.git_subcommand(tokens)
        if subcommand == "clean" and not _only_lists(rest):
            return "clean"
    return None


def kind(command: str) -> str | None:
    """The first deletion the command line performs.

    Not a regex over the raw string: it cannot tell where a token sits, so the word inside a
    sed script reads as a deletion while a wrapped one (sudo, xargs, find -exec) does not.
    """
    try:
        # next() stays inside the guard: commands() yields lazily, so the tokenizer raises
        # here rather than at the call that builds the iterator.
        return next((k for k in map(_deletes, command_scan.commands(command)) if k), None)
    except ValueError:
        return "verb"  # an unparsable line hides where its commands are, so it is not cleared


def main() -> None:
    raw = sys.stdin.read()
    # `clean` is paired with `git` here rather than listed in TRIGGERS, so `cargo clean` stays off.
    if not (any(word in raw for word in TRIGGERS) or ("git" in raw and "clean" in raw)):
        return

    command = field(parse(raw).get("tool_input"), "command")
    if not isinstance(command, str) or not command:
        return

    found = kind(command)
    if found:
        deny(REASONS[found])


if __name__ == "__main__":
    main()
