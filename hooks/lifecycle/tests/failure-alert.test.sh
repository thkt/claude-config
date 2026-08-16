#!/usr/bin/env bash
# Integration tests for lifecycle/notify-failure.sh (Stop / StopFailure hook)
# afplay is replaced by a stub on PATH, so the assertions read whether a sound was asked for
# rather than listening for one.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../tests/helpers.sh"
HOOK="$SCRIPT_DIR/../notify-failure.sh"

# Template under $TMPDIR: macOS mktemp without a template ignores TMPDIR
TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/notify-failure-tests-XXXXXX")
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
# orphaned subshell, which under load took over a second where an idle machine took 0.05. A
# run that should stay silent has nothing to wait for, so polling it to the same ceiling only
# spends the ceiling: at 5 seconds the four silent cases turned a 4-second suite into 18.
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
  echo "T-001: end_turn 以外で終わったターンは鳴らす"
  assert_contains "max_tokens" "Heavy" "$(run_hook stop '{"stop_reason":"max_tokens"}')"
}

test_a_normal_stop_is_silent() {
  echo "T-002: 正常終了は鳴らさない"
  # 画面に答えが出ているので、鳴らすと拾いに行くべき失敗の音と競合する。
  assert_empty "end_turn" "$(silent_hook stop '{"stop_reason":"end_turn"}')"
}

test_a_missing_stop_reason_is_silent() {
  echo "T-003: stop_reason が無い payload は正常終了として扱う"
  assert_empty "no key" "$(silent_hook stop '{"session_id":"abc"}')"
}

test_a_subagent_is_silent() {
  echo "T-004: subagent の終了はターンの終わりではない"
  assert_empty "subagent" "$(silent_hook stop '{"stop_reason":"max_tokens"}' 1)"
}

test_stop_failure_always_sounds() {
  echo "T-005: StopFailure は API エラーなので常に鳴らす"
  assert_contains "fail" "Heavy" "$(run_hook fail '{}')"
}

test_the_sound_file_is_named() {
  echo "T-006: 鳴らすファイルが sounds/ に実在する"
  # ファイル名を変えたまま音源を置き換え忘れると、hook は黙って何もしない。
  local named
  named=$(rg -o 'DHVMagellanHorn_[A-Za-z]+\.mp3' "$HOOK" | head -1)
  assert_eq "the file exists" "yes" \
    "$([[ -f "$SCRIPT_DIR/../../../sounds/$named" ]] && echo yes || echo no)"
}

echo "=== notify-failure.sh tests ==="
test_an_error_stop_sounds
test_a_normal_stop_is_silent
test_a_missing_stop_reason_is_silent
test_a_subagent_is_silent
test_stop_failure_always_sounds
test_the_sound_file_is_named

report_results
