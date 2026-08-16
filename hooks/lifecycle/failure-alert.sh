#!/bin/zsh
# Stop / StopFailure hook: sound the turn that ended badly.
#
# Only failure is announced. A completed turn puts its answer on screen, so a sound for it
# competes with the one case worth looking up for.
#
# StopFailure is an API error and always qualifies. Stop covers both, so it reads
# stop_reason and stays silent on end_turn. A subagent finishing is not the turn ending.
set +e

[[ -n "${CLAUDE_CODE_IS_SUBAGENT:-}" ]] && exit 0

if [[ "${1:-}" == "stop" ]]; then
  input=$(cat)
  # No stop_reason key means end_turn, and jq is only needed to read one that is there.
  case "$input" in
    *stop_reason*) ;;
    *) exit 0 ;;
  esac
  # Without jq the reason cannot be read, and a sound on every turn would train the ear to
  # ignore it.
  command -v jq &>/dev/null || exit 0
  reason="$(printf '%s' "$input" | jq -r '.stop_reason // "end_turn"' 2>/dev/null)"
  [[ "${reason:-end_turn}" == "end_turn" ]] && exit 0
fi

# Not $HOME/.claude, which names the installed harness alone: a checkout run from anywhere
# else finds no sounds there.
SOUND="$(cd "$(dirname "$0")" && pwd)/../../sounds/DHVMagellanHorn_Heavy.mp3"
[[ -f "$SOUND" ]] && afplay -volume 0.1 "$SOUND" &

exit 0
