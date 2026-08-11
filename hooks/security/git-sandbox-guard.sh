#!/bin/zsh
# PreToolUse hook: stop tree-rewriting git commands from running sandboxed in ~/.claude.
#
# The sandbox denies Bash writes under agents/ rules/ skills/ hooks/ commands/ workflows/
# even when settings.json lists them in sandbox.filesystem.allowWrite. git moves HEAD
# anyway, so the tree is left with HEAD on one commit and those directories on another,
# and the next pull refuses to run because the tree reads as dirty. Recovering takes a
# reset plus a per-file checkout, which is why this is worth blocking up front.
#
# Failure mode: fail-closed. A command line shlex cannot close hides where its git call
# sits, so it is not cleared.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
}

INPUT=$(cat)

# Fast-exit before forking jq: only a line mentioning git can reach a denial.
case "$INPUT" in
  *git*) ;;
  *) exit 0 ;;
esac

command -v jq >/dev/null 2>&1 || exit 0

read -r ESCAPED CWD < <(printf '%s' "$INPUT" | jq -r '[(.tool_input.dangerouslyDisableSandbox // false | tostring), (.cwd // "")] | @tsv') || true

# The caller already turned the sandbox off, so the writes this guard protects will land.
[[ "$ESCAPED" == "true" ]] && exit 0

# Only the repository whose files the sandbox protects. Another repository checked out
# under a different path writes freely and needs no guard.
TOPLEVEL=$(git -C "${CWD:-$PWD}" rev-parse --show-toplevel 2>/dev/null || true)
[[ "$TOPLEVEL" == "$HOME/.claude" ]] || exit 0

COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')

RETRY='dangerouslyDisableSandbox: true を付けて同じコマンドを実行し直す。それも拒否されたら、ユーザーに `! <コマンド>` での実行を依頼する。'

if ! command -v python3 >/dev/null 2>&1; then
  deny "git-sandbox-guard: python3 が無くコマンドを解析できず、作業ツリーを書き換える git かどうかを判定できない。python3 を用意する。"
  exit 0
fi

# Not a regex over the raw string: it cannot tell where a token sits, so `git pull` inside
# a commit message would read as a pull, and `git -C other/repo pull` would read as one here.
if printf '%s' "$COMMAND" | LIB_DIR="$SCRIPT_DIR/../lib" python3 -c '
import os
import sys

sys.path.insert(0, os.environ["LIB_DIR"])
import command_scan

# Subcommands that write tracked files in the working tree.
REWRITES = frozenset({
    "checkout", "switch", "restore", "pull", "merge", "rebase", "revert",
    "cherry-pick", "stash", "am", "apply", "clean", "reset",
})

# git own options that swallow the token after them, which would otherwise read as the
# subcommand.
VALUED_GIT_FLAGS = frozenset({"-C", "-c", "--git-dir", "--work-tree", "--namespace"})

# Creating a branch leaves every file where it is.
BRANCH_CREATE = frozenset({"-b", "-B", "-c", "-C"})

# soft and mixed stop at the index. Only these three carry the change into the tree.
RESET_WRITES = frozenset({"--hard", "--merge", "--keep"})

# Reading the stash writes nothing.
STASH_READS = frozenset({"list", "show", "drop", "clear"})


def rewrites_tree(tokens):
    args = tokens[1:]
    index = 0
    while index < len(args) and args[index].startswith("-"):
        index += 2 if args[index] in VALUED_GIT_FLAGS else 1
    if index >= len(args):
        return False
    subcommand, rest = args[index], args[index + 1 :]
    if subcommand not in REWRITES:
        return False
    if subcommand in ("checkout", "switch") and any(a in BRANCH_CREATE for a in rest):
        return False
    if subcommand == "reset" and not any(a in RESET_WRITES for a in rest):
        return False
    if subcommand == "stash" and rest and rest[0] in STASH_READS:
        return False
    return True


try:
    hit = any(c[0] == "git" and rewrites_tree(c) for c in command_scan.commands(sys.stdin.read()))
except ValueError:
    hit = True
sys.exit(0 if hit else 1)
'; then
  deny "git-sandbox-guard: このリポジトリで作業ツリーを書き換える git は sandbox 内で走らせない。agents/ rules/ skills/ hooks/ commands/ workflows/ への書き込みが拒否され、HEAD だけ進んで作業ツリーと食い違う。${RETRY}"
fi
