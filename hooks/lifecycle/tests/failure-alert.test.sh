#!/usr/bin/env bash
# Integration tests for lifecycle/failure-alert.sh (Stop / StopFailure hook)
# afplay is replaced by a stub on PATH, so the assertions read whether a sound was asked for
# rather than listening for one.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../tests/helpers.sh"
HOOK="$SCRIPT_DIR/../failure-alert.sh"

# Template under $TMPDIR: macOS mktemp without a template ignores TMPDIR
TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/failure-alert-tests-XXXXXX")
trap 'rm -rf "$TEST_TMPDIR"' EXIT

STUB_BIN="$TEST_TMPDIR/bin"
mkdir -p "$STUB_BIN"
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "$AFPLAY_LOG"\n' > "$STUB_BIN/afplay"
chmod +x "$STUB_BIN/afplay"

LOG="$TEST_TMPDIR/afplay.log"

# The hook backgrounds afplay, and the job belongs to its own shell rather than to this one,
# so `wait` here would return before it runs. Poll the log instead.
#
# The two expectations need opposite deadlines. A run that should sound has to wait out the
# orphaned subshell, which under load takes over a second. A run that should stay silent has
# nothing to wait for, so polling it to the same ceiling only spends the ceiling.
SOUND_LIMIT=100
SILENT_LIMIT=6

run_hook() {
  local action="$1" payload="${2:-}" subagent="${3:-}" limit="${4:-$SOUND_LIMIT}"
  : > "$LOG"
  printf '%s' "$payload" | (
    export PATH="$STUB_BIN:$PATH"
    export AFPLAY_LOG="$LOG"
    export CLAUDE_CODE_IS_SUBAGENT="$subagent"
    "$HOOK" "$action"
  ) 2>/dev/null
  local waited=0
  while [[ ! -s "$LOG" && $waited -lt $limit ]]; do
    sleep 0.05
    waited=$((waited + 1))
  done
  cat "$LOG"
}

# A case that expects silence still gives the subshell a moment, so a hook that wrongly sounds
# is caught rather than racing past the assertion.
silent_hook() {
  run_hook "$1" "${2:-}" "${3:-}" "$SILENT_LIMIT"
}

test_an_error_stop_sounds() {
  echo "T-001: A turn ending on anything but end_turn sounds"
  assert_contains "max_tokens" "Heavy" "$(run_hook stop '{"stop_reason":"max_tokens"}')"
}

test_a_normal_stop_is_silent() {
  echo "T-002: A clean finish stays silent"
  # The answer is already on screen, so a sound here competes with the failure sound worth
  # going after.
  assert_empty "end_turn" "$(silent_hook stop '{"stop_reason":"end_turn"}')"
}

test_a_missing_stop_reason_is_silent() {
  echo "T-003: A payload with no stop_reason counts as a clean finish"
  assert_empty "no key" "$(silent_hook stop '{"session_id":"abc"}')"
}

test_a_subagent_is_silent() {
  echo "T-004: A subagent finishing is not the end of a turn"
  assert_empty "subagent" "$(silent_hook stop '{"stop_reason":"max_tokens"}' 1)"
}

test_stop_failure_always_sounds() {
  echo "T-005: StopFailure is an API error and always sounds"
  assert_contains "fail" "Heavy" "$(run_hook fail '{}')"
}

test_the_sound_file_is_named() {
  echo "T-006: The file it plays exists under sounds/"
  # Renaming the file without replacing the source leaves the hook doing nothing, silently.
  local named
  named=$(rg -o 'DHVMagellanHorn_[A-Za-z]+\.mp3' "$HOOK" | head -1)
  assert_eq "the file exists" "yes" \
    "$([[ -f "$SCRIPT_DIR/../../../sounds/$named" ]] && echo yes || echo no)"
}

echo "=== failure-alert.sh tests ==="
test_an_error_stop_sounds
test_a_normal_stop_is_silent
test_a_missing_stop_reason_is_silent
test_a_subagent_is_silent
test_stop_failure_always_sounds
test_the_sound_file_is_named

report_results
