#!/usr/bin/env bash
# Integration tests for lifecycle/reflection-ask.sh (Stop hook)
# The hook is exec'd directly (shebang zsh) — running it under bash masks
# zsh-specific behavior. See DR-0097.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"
HOOK="$SCRIPT_DIR/../lifecycle/reflection-ask.sh"

make_stop_json() {
  echo '{"session_id":"test-session","hook_event_name":"Stop","stop_hook_active":false,"transcript_path":"/tmp/reflection-ask-test-transcript.jsonl"}'
}

# HOME is overridden per test to an empty temp dir, so the throttle's cache
# file starts absent every time: no leakage from a real run, and no leakage
# between tests in this file.
# A `VAR=val cmd1 | cmd2` prefix scopes only to cmd1, not the rest of the
# pipeline, so HOME must be exported for the whole subshell to reach $HOOK.
run_hook() {
  (export HOME="$FAKE_HOME"; make_stop_json | "$HOOK") 2>/dev/null
}

test_second_call_within_window_is_silent() {
  echo "T-001: window 内に 2 度目が来ると何も返さず終わる"
  local FAKE_HOME first second
  FAKE_HOME=$(mktemp -d "${TMPDIR:-/tmp}/reflection-ask-testXXXXXX")
  first=$(run_hook) || true
  assert_contains "1st call (elapsed state) returns a systemMessage" '"systemMessage"' "$first"
  second=$(run_hook) || true
  assert_empty "2nd call inside the same window returns nothing" "$second"
  rm -rf "$FAKE_HOME"
}

test_call_past_window_returns_systemMessage() {
  echo "T-002: window を過ぎていれば systemMessage を返す"
  local FAKE_HOME output
  FAKE_HOME=$(mktemp -d "${TMPDIR:-/tmp}/reflection-ask-testXXXXXX")
  output=$(run_hook) || true
  assert_contains "systemMessage key present" '"systemMessage"' "$output"
  assert_contains "additionalContext key present" '"additionalContext"' "$output"
  rm -rf "$FAKE_HOME"
}

test_question_requires_answer_even_when_nothing_to_leave() {
  echo "T-003: 問いの文言は、残すものが無い場合も答えるよう求める"
  local FAKE_HOME output message
  FAKE_HOME=$(mktemp -d "${TMPDIR:-/tmp}/reflection-ask-testXXXXXX")
  output=$(run_hook) || true
  message=$(printf '%s' "$output" | jq -r '.systemMessage // empty' 2>/dev/null) || true
  assert_contains "names the no-corrections case" "無ければ" "$message"
  assert_contains "still demands an explicit reply in that case" "答え" "$message"
  rm -rf "$FAKE_HOME"
}

test_additionalcontext_path_has_real_file() {
  echo "T-004: additionalContext が指すパスに実ファイルがある"
  local FAKE_HOME output message path_ref repo_root path_found file_exists
  FAKE_HOME=$(mktemp -d "${TMPDIR:-/tmp}/reflection-ask-testXXXXXX")
  output=$(run_hook) || true
  message=$(printf '%s' "$output" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null) || true
  path_ref=$(printf '%s' "$message" | grep -oE 'rules/[A-Za-z0-9_./-]+\.md' | head -n1) || true
  path_found=$([[ -n "$path_ref" ]] && echo yes || echo no)
  assert_eq "additionalContext names a rules/*.md path" "yes" "$path_found"
  repo_root="$(cd "$SCRIPT_DIR/../.." && pwd)"
  file_exists=$([[ -n "$path_ref" && -f "$repo_root/$path_ref" ]] && echo yes || echo no)
  assert_eq "the named path exists as a real file" "yes" "$file_exists"
  rm -rf "$FAKE_HOME"
}

test_script_never_launches_claude() {
  echo "T-005: スクリプトは claude を起動する行を持たない"
  local exists code
  exists=$([[ -s "$HOOK" ]] && echo yes || echo no)
  assert_eq "hook script exists" "yes" "$exists"
  code=$(grep -v '^[[:space:]]*#' "$HOOK" 2>/dev/null || true)
  assert_not_contains "no bare claude invocation" "claude " "$code"
  assert_not_contains "no claude backtick substitution" '`claude' "$code"
  assert_not_contains "no claude command substitution" '$(claude' "$code"
}

echo "=== reflection-ask.sh tests ==="
test_second_call_within_window_is_silent
test_call_past_window_returns_systemMessage
test_question_requires_answer_even_when_nothing_to_leave
test_additionalcontext_path_has_real_file
test_script_never_launches_claude

report_results
