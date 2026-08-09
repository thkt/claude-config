#!/bin/zsh
# Stop hook: ask the agent to write down this session's reflection before finishing.
#
# Why Stop (not SessionEnd): SessionEnd cannot inject additionalContext back into the
# agent's own turn, so the reflection would never reach the transcript it describes.
# Stop can, and it fires once the agent already believes the work is done.
#
# Throttled: because it fires on every Stop, asking every turn would repeat the same
# question inside one work session. Reuse recall-index.sh's throttle structure (shared
# timestamp file under ~/.cache, find -mmin window check) so it asks at most once per
# WINDOW_MIN instead of once per turn.
#
# Fail-open (advisory): never block the turn from finishing.
set +e

cat >/dev/null

command -v jq >/dev/null 2>&1 || exit 0

# Throttle: skip if asked within the last WINDOW_MIN minutes (timestamp shared across sessions).
WINDOW_MIN=240
LAST="${HOME}/.cache/claude-reflection-ask.last"
mkdir -p "${LAST:h}" 2>/dev/null
if [[ -f "$LAST" && -n "$(find "$LAST" -mmin "-${WINDOW_MIN}" 2>/dev/null)" ]]; then
  exit 0
fi
touch "$LAST"

MSG="reflection-ask: このセッションで得た訂正・知見のうち、次回セッションに残す価値があるものを一つ言語化し、rules/CORRECTIONS.md に追記する形で答える。無ければ「残すものなし」とその判断も明示して答える。"

jq -n --arg m "$MSG" '{
  systemMessage: $m,
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: $m
  }
}'
exit 0
