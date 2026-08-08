#!/bin/bash
# PreToolUse hook: Convert package manager commands to ni equivalents
# Requires: jq, ni
# Uses bash (not zsh) because BASH_REMATCH is required for regex match extraction.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0
command -v ni >/dev/null 2>&1 || exit 0

INPUT=$(cat)

# Fast-exit: skip jq fork unless input looks like a package manager command
# (this hook fires on every Bash invocation; ~99% are irrelevant)
case "$INPUT" in
  *'"command":"npm'*|*'"command":"npx'*|*'"command":"pnpm'*|*'"command":"yarn'*|*'"command":"bun'*) ;;
  *) exit 0 ;;
esac

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Only process package manager commands (bash builtin parameter expansion — no fork)
FIRST_TOKEN="${COMMAND%% *}"
case "$FIRST_TOKEN" in
  npm|npx|pnpm|yarn|bun|bunx) ;;
  *) exit 0 ;;
esac

convert_to_ni() {
  local cmd="$1"

  # npx / bunx → nlx
  if [[ "$cmd" =~ ^npx\ (.+) ]]; then echo "nlx ${BASH_REMATCH[1]}"; return; fi
  if [[ "$cmd" =~ ^bunx\ (.+) ]]; then echo "nlx ${BASH_REMATCH[1]}"; return; fi

  local rest="${cmd#* }"
  local subcmd="${rest%% *}"
  local args=""
  if [[ "$rest" == *" "* ]]; then
    args="${rest#* }"
  fi

  case "$subcmd" in
    install|i)
      if [ -z "$args" ] || [ "$subcmd" = "$rest" ]; then
        echo "ni"
      else
        echo "ni $args"
      fi
      ;;
    add)
      if [ -n "$args" ]; then echo "ni $args"; else echo "ni"; fi
      ;;
    ci)
      echo "nci"
      ;;
    run)
      echo "nr $args"
      ;;
    test|t)
      if [ -n "$args" ]; then echo "nr test $args"; else echo "nr test"; fi
      ;;
    start)
      if [ -n "$args" ]; then echo "nr start $args"; else echo "nr start"; fi
      ;;
    exec|dlx|x)
      if [ -n "$args" ]; then echo "nlx $args"; else echo ""; fi
      ;;
    uninstall|remove|rm|un)
      if [ -n "$args" ]; then echo "nun $args"; else echo ""; fi
      ;;
    update|up|upgrade)
      if [ -z "$args" ] || [ "$subcmd" = "$rest" ]; then
        echo "nup"
      else
        echo "nup $args"
      fi
      ;;
    *)
      # Bare command (e.g. "yarn") → install, unknown subcommand → delegate to na
      if [ "$rest" = "$cmd" ]; then
        echo "ni"
      elif [ -n "$args" ]; then
        echo "na $subcmd $args"
      else
        echo "na $subcmd"
      fi
      ;;
  esac
}

NEW_COMMAND=$(convert_to_ni "$COMMAND")

if [ -z "$NEW_COMMAND" ]; then
  exit 0
fi

jq -n \
  --arg cmd "$NEW_COMMAND" \
  --arg from "$FIRST_TOKEN" \
  '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: ("auto-package-manager: " + $from + " → ni"),
      updatedInput: {
        command: $cmd
      }
    }
  }'

exit 0
