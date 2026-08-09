#!/bin/zsh
# PreToolUse hook: Redirect rm/rmdir/unlink/shred to `mv ~/.Trash/`
# Failure mode: fail-closed (security enforcement)

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

# Fast-exit: skip the jq and python forks unless input mentions a destructive keyword
case "$INPUT" in
  *rm*|*unlink*|*shred*) ;;
  *) exit 0 ;;
esac

command -v jq >/dev/null 2>&1 || exit 0

COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')

if ! command -v python3 >/dev/null 2>&1; then
  deny "rm-to-trash: python3 が無くコマンドを解析できず、削除かどうかを判定できない。python3 を用意する"
  exit 0
fi

# Whether a token deletes anything depends on where it sits, which a regex over the raw
# string cannot tell: it read the word inside a sed script as a deletion and let a
# wrapped one (sudo, xargs, find -exec) through.
if printf '%s' "$COMMAND" | LIB_DIR="$SCRIPT_DIR/../lib" python3 -c '
import os
import sys

sys.path.insert(0, os.environ["LIB_DIR"])
import command_scan

DESTRUCTIVE = {"rm", "rmdir", "unlink", "shred"}
try:
    hit = any(c[0] in DESTRUCTIVE for c in command_scan.commands(sys.stdin.read()))
except ValueError:
    hit = True  # an unparsable line hides where its commands are, so it is not cleared
sys.exit(0 if hit else 1)
'; then
  deny "rm-to-trash: 削除は \`mv <file> ~/.Trash/ && git add <file>\` を使う。sandbox が \`mv ~/.Trash/\` を弾いたら dangerouslyDisableSandbox: true でリトライし、他の sandbox エラーはユーザーに報告する。"
fi
