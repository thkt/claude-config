#!/bin/zsh
# Stop hook: ask the agent to write down this session's reflection before finishing.
#
# Why Stop (not SessionEnd): SessionEnd cannot inject additionalContext back into the
# agent's own turn, so the reflection would never reach the transcript it describes.
# Stop can, and it fires once the agent already believes the work is done.
#
# Scoped by session, not by elapsed time: Stop fires on every turn, and a window in
# minutes repeats inside a long session while skipping a short one entirely.
#
# Fail-open (advisory): never block the turn from finishing.
set +e

INPUT=$(cat)

command -v jq >/dev/null 2>&1 || exit 0

SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)
[[ -z "$SESSION_ID" ]] && exit 0

LAST="${HOME}/.cache/claude-reflection-ask.session"
mkdir -p "${LAST:h}" 2>/dev/null
[[ -f "$LAST" && "$(cat "$LAST" 2>/dev/null)" == "$SESSION_ID" ]] && exit 0
printf '%s' "$SESSION_ID" > "$LAST"

MSG="reflection-ask: このセッションで得た訂正・知見のうち、次回セッションに残す価値があるものを一つ .claude/rules/CORRECTIONS.md に追記する。残すものが無ければ何も書かない。"

jq -n --arg m "$MSG" '{
  systemMessage: $m,
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: $m
  }
}'
exit 0
