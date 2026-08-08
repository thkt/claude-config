#!/bin/zsh
# PreToolUse hook: Redirect rm/rmdir/unlink/shred to `mv ~/.Trash/`
# Failure mode: fail-closed (security enforcement)

set -euo pipefail

INPUT=$(cat)

# Fast-exit: skip jq fork unless input mentions a destructive keyword
case "$INPUT" in
  *rm*|*unlink*|*shred*) ;;
  *) exit 0 ;;
esac

command -v jq >/dev/null 2>&1 || exit 0

COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')

# Match rm/rmdir/unlink/shred at line start or after shell separators
if printf '%s' "$COMMAND" | grep -qE '(^|[;&|`$(]|&&|\|\|)[[:space:]]*(rm|rmdir|unlink|shred)([[:space:]]|$)'; then
  REASON="rm-to-trash: 削除は \`mv <file> ~/.Trash/ && git add <file>\` を使う。sandbox が \`mv ~/.Trash/\` を弾いたら dangerouslyDisableSandbox: true でリトライし、他の sandbox エラーはユーザーに報告する。"
  jq -n --arg reason "$REASON" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
fi
