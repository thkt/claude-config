#!/bin/zsh
# StopFailure hook: notify when turn ends due to API error
# (rate limit, auth failure, etc.)
set +e

command -v jq &>/dev/null || exit 0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/notify.sh"

play_sound "DHVMagellanHorn_Heavy.mp3"

exit 0
