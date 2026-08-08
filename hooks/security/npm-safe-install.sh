#!/bin/zsh
# PreToolUse hook: Block package install when ignore-scripts is not configured
# Failure mode: fail-closed (security enforcement)

set -euo pipefail

INPUT=$(cat)

# Fast-exit: skip jq fork unless input starts with a supported package manager
# (this hook fires on every Bash invocation; ~99% are irrelevant)
case "$INPUT" in
  *'"command":"npm'*|*'"command":"pnpm'*|*'"command":"yarn'*|*'"command":"bun'*|*'"command":"ni'*|*'"command":"nci'*|*'"command":"nup'*) ;;
  *) exit 0 ;;
esac

command -v jq >/dev/null 2>&1 || exit 0

COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')
FIRST="${COMMAND%% *}"
REST="${COMMAND#* }"
SUBCMD="${REST%% *}"

MATCH=0
case "$FIRST" in
  npm|pnpm|yarn|bun)
    case "$SUBCMD" in
      install|i|ci|add|update|up|upgrade) MATCH=1 ;;
    esac
    ;;
  ni|nci|nup) MATCH=1 ;;
esac

[[ $MATCH -eq 1 ]] || exit 0

NPMRC="$HOME/.npmrc"
if [[ -f "$NPMRC" ]] && grep -q '^ignore-scripts=true' "$NPMRC" 2>/dev/null; then
  exit 0
fi

REASON="npm-safe-install: ~/.npmrc に ignore-scripts=true が無く、依存の install script が任意のコードを実行できる。echo 'ignore-scripts=true' >> ~/.npmrc を実行してから再試行する。"
jq -n --arg reason "$REASON" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "block",
    permissionDecisionReason: $reason
  }
}'
