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
# Fires in every Claude Code process on this machine, since the wiring lives in the global
# settings. The mark below is per session for that reason.
#
# Fail-open (advisory): never block the turn from finishing.
set +e

INPUT=$(cat)

command -v jq >/dev/null 2>&1 || exit 0

SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)
[[ -z "$SESSION_ID" ]] && exit 0

# One mark per session, not one shared record. A hook wired in the global settings fires in
# every Claude Code process on this machine, and a single record has them overwrite each
# other's id, so each one sees a stranger's and asks again.
ASKED_DIR="${HOME}/.cache/claude-reflection-ask"
MARK="$ASKED_DIR/$SESSION_ID"
[[ -f "$MARK" ]] && exit 0
mkdir -p "$ASKED_DIR" 2>/dev/null
touch "$MARK"
find "$ASKED_DIR" -type f -mtime +7 -delete 2>/dev/null

MSG="reflection-ask: このセッションで得た訂正・知見のうち、次回セッションに残す価値があるものを一つ .claude/rules/CORRECTIONS.md に追記する。残すものが無ければ何も書かない。"

jq -n --arg m "$MSG" '{
  systemMessage: $m,
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: $m
  }
}'
exit 0
