#!/bin/zsh
# SessionStart hook: catch up recall's cross-session index in the background.
#
# Why SessionStart (not SessionEnd):
#   - the previous session's transcript is already flushed to disk, so it gets picked up
#   - SessionStart always fires (SessionEnd can be missed on hard kill); misses self-heal
#   - `recall index` EMBEDS new sessions (measured ~6s typical, ~26s on backlog; the cost is
#     IO/network-bound, not CPU). A multi-second job detached at SessionEnd risks being reaped
#     mid-embed as the session tears down; at start the session stays alive, so it completes.
#
# Throttled: because it embeds, `recall index` is not free. Skip if it ran recently, so a burst
# of session starts costs a single stat and a real catch-up runs at most once per window.
#
# Fail-open (advisory): never block the prompt.
set +e

INPUT=$(cat)

# Skip compaction restarts: no newly completed sessions, and the live transcript is mid-write
# (recall searches past sessions, never the live one).
if command -v jq >/dev/null 2>&1; then
  [[ "$(printf '%s' "$INPUT" | jq -r '.source // ""' 2>/dev/null)" == "compact" ]] && exit 0
else
  case "$INPUT" in *'"source"'*'"compact"'*) exit 0 ;; esac
fi

RECALL=/opt/homebrew/bin/recall
[[ -x "$RECALL" ]] || exit 0

# Throttle: skip if indexed within the last WINDOW_MIN minutes (timestamp shared across sessions).
# WINDOW_MIN is effectively the worst-case staleness: a session completed just after a run waits
# up to this long to become searchable. recall serves days-old "past decisions", so hours are fine;
# the bound exists mainly to kill session-start churn (this harness starts dozens of sessions/day).
WINDOW_MIN=180
LAST="${HOME}/.cache/claude-recall-index.last"
mkdir -p "${LAST:h}" 2>/dev/null
if [[ -f "$LAST" && -n "$(find "$LAST" -mmin "-${WINDOW_MIN}" 2>/dev/null)" ]]; then
  exit 0
fi
touch "$LAST"

# Detach so the embed pass never delays the prompt. SQLite WAL serializes concurrent writers,
# so parallel session starts are safe without an explicit lock.
( "$RECALL" index >/dev/null 2>&1 & )

exit 0
