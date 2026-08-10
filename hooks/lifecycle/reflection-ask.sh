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

# The repository root, not the payload's cwd: a turn run from a subdirectory would grow a
# second .claude/ there. Resolved before the mark is written, so a session that starts
# outside git still gets asked once it moves into a repository.
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // ""' 2>/dev/null)
[[ -z "$CWD" ]] && exit 0
ROOT=$(cd "$CWD" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)
[[ -z "$ROOT" ]] && exit 0
TARGET="$ROOT/.claude/rules/CORRECTIONS.md"
TRANSCRIPT=$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)

# One mark per session, not one shared record: the wiring lives in the global settings, so
# every Claude Code process on this machine runs this hook and would overwrite the others.
ASKED_DIR="${HOME}/.cache/claude-reflection-ask"
MARK="$ASKED_DIR/$SESSION_ID"
[[ -f "$MARK" ]] && exit 0
mkdir -p "$ASKED_DIR" 2>/dev/null
touch "$MARK"
find "$ASKED_DIR" -type f -mtime +7 -delete 2>/dev/null

# An absolute path and a subagent: a relative path let an agent that could not resolve it
# fall back to the global ~/.claude tree, and reading the session back to compose the entry
# is what makes the turn wait.
MSG="reflection-ask: このセッションで得た訂正・知見のうち、次回セッションに残す価値があるものを一つ書き残す。書くのは Agent tool の subagent 1 体に任せ、あなた自身は追記しない。subagent へ渡すのは transcript のパス ${TRANSCRIPT} と書き込み先 ${TARGET} の 2 つで、書き込み先はこの 1 つに限る。途中のディレクトリごと無ければ作り、残すものが無ければ何も書かない。"

jq -n --arg m "$MSG" '{
  systemMessage: $m,
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: $m
  }
}'
exit 0
