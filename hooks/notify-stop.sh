#!/bin/zsh
# Stop hook: play different sounds based on context
# - Subagent: silent
# - Main (error): Heavy
# - Main (success): Cleaned
set +e

[[ -n "${CLAUDE_CODE_IS_SUBAGENT:-}" ]] && exit 0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/notify.sh"

INPUT=$(cat)

# Fast-exit: no stop_reason key → default end_turn → play Cleaned immediately
case "$INPUT" in
  *stop_reason*) ;;
  *) play_sound "DHVMagellanHorn_Cleaned.mp3"; exit 0 ;;
esac

command -v jq &>/dev/null || { play_sound "DHVMagellanHorn_Cleaned.mp3"; exit 0; }

STOP_REASON="$(printf '%s' "$INPUT" | jq -r '.stop_reason // "end_turn"' 2>/dev/null)"
STOP_REASON="${STOP_REASON:-end_turn}"

if [[ "$STOP_REASON" != "end_turn" ]]; then
  play_sound "DHVMagellanHorn_Heavy.mp3"
else
  play_sound "DHVMagellanHorn_Cleaned.mp3"
fi
