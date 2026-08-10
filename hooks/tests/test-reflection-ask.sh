#!/usr/bin/env bash
# Integration tests for lifecycle/reflection-ask.sh (Stop hook)
# The hook is exec'd directly (shebang zsh) — running it under bash masks
# zsh-specific behavior.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"
HOOK="$SCRIPT_DIR/../lifecycle/reflection-ask.sh"

TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/reflection-ask-testXXXXXX")
trap 'rm -rf "$TEST_TMPDIR"' EXIT

fresh_home() { mktemp -d "$TEST_TMPDIR/homeXXXXXX"; }

# cwd defaults to this test directory, a subdirectory of the repository, so the default
# path already exercises the root resolution rather than a lucky top-level run.
make_stop_json() {
  echo "{\"session_id\":\"${1:-test-session}\",\"cwd\":\"${2:-$SCRIPT_DIR}\",\"transcript_path\":\"$TEST_TMPDIR/transcript.jsonl\",\"hook_event_name\":\"Stop\",\"stop_hook_active\":false}"
}

# HOME is overridden per test so the record of the last asked session starts absent,
# leaking neither from a real run nor between tests here.
# A `VAR=val cmd1 | cmd2` prefix scopes to cmd1 alone, so HOME is exported for the whole
# subshell to reach $HOOK.
run_hook() {
  (export HOME="$FAKE_HOME"; make_stop_json "${1:-}" "${2:-}" | "$HOOK") 2>/dev/null
}

test_second_call_in_same_session_is_silent() {
  echo "T-001: 同じセッションで 2 度目が来ると何も返さず終わる"
  local FAKE_HOME first second
  FAKE_HOME=$(fresh_home)
  first=$(run_hook session-a) || true
  assert_contains "1st call returns a systemMessage" '"systemMessage"' "$first"
  second=$(run_hook session-a) || true
  assert_empty "2nd call in the same session returns nothing" "$second"
}

test_new_session_returns_systemMessage() {
  echo "T-002: セッションが変われば systemMessage を返す"
  local FAKE_HOME first output
  FAKE_HOME=$(fresh_home)
  first=$(run_hook session-a) || true
  output=$(run_hook session-b) || true
  assert_contains "systemMessage key present" '"systemMessage"' "$output"
  assert_contains "additionalContext key present" '"additionalContext"' "$output"
}

test_question_leaves_nothing_when_there_is_nothing() {
  echo "T-003: 問いの文言は、残すものが無いとき何も書かないよう求める"
  local FAKE_HOME output message
  FAKE_HOME=$(fresh_home)
  output=$(run_hook) || true
  message=$(printf '%s' "$output" | jq -r '.systemMessage // empty' 2>/dev/null) || true
  assert_contains "names the no-corrections case" "残すものが無ければ" "$message"
  assert_contains "asks for no entry in that case" "何も書かない" "$message"
}

test_additionalcontext_path_has_real_file() {
  echo "T-005: additionalContext が指すパスに実ファイルがある"
  local FAKE_HOME output message path_ref path_found file_exists
  FAKE_HOME=$(fresh_home)
  output=$(run_hook) || true
  message=$(printf '%s' "$output" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null) || true
  path_ref=$(printf '%s' "$message" | grep -oE '/[A-Za-z0-9_./-]+/\.claude/rules/CORRECTIONS\.md' | head -n1) || true
  path_found=$([[ -n "$path_ref" ]] && echo yes || echo no)
  assert_eq "additionalContext names an absolute .claude/rules path" "yes" "$path_found"
  file_exists=$([[ -n "$path_ref" && -f "$path_ref" ]] && echo yes || echo no)
  assert_eq "the named path exists as a real file" "yes" "$file_exists"
}

# The unresolved relative path is what put a Rust project's entry in the global tree.
test_subdirectory_resolves_to_repository_root() {
  echo "T-006: サブディレクトリの cwd でもリポジトリルートを指す"
  local FAKE_HOME output message repo_root
  FAKE_HOME=$(fresh_home)
  repo_root="$(cd "$SCRIPT_DIR/../.." && pwd)"
  output=$(run_hook session-subdir "$SCRIPT_DIR") || true
  message=$(printf '%s' "$output" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null) || true
  assert_contains "names the repository root" "$repo_root/.claude/rules/CORRECTIONS.md" "$message"
}

test_outside_a_repository_is_silent() {
  echo "T-007: リポジトリ外の cwd では何も返さない"
  local FAKE_HOME outside output
  FAKE_HOME=$(fresh_home)
  outside=$(mktemp -d "$TEST_TMPDIR/outsideXXXXXX")
  output=$(run_hook session-outside "$outside") || true
  assert_empty "no message outside a repository" "$output"
}

test_write_is_delegated_to_a_subagent() {
  echo "T-008: 追記を subagent へ委ね、呼ばれた側は自分で書かない"
  local FAKE_HOME output message
  FAKE_HOME=$(fresh_home)
  output=$(run_hook) || true
  message=$(printf '%s' "$output" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null) || true
  assert_contains "hands the write to a subagent" "subagent" "$message"
  assert_contains "keeps the caller from writing" "あなた自身は追記しない" "$message"
  assert_contains "passes the transcript path" "$TEST_TMPDIR/transcript.jsonl" "$message"
  # scout had no .claude/rules at all, so naming the file alone leaves the creation of the
  # directory to the subagent's judgment.
  assert_contains "asks for the missing directories too" "途中のディレクトリごと無ければ作り" "$message"
}

test_script_never_launches_claude() {
  echo "T-004: スクリプトは claude を起動する行を持たない"
  local exists code
  exists=$([[ -s "$HOOK" ]] && echo yes || echo no)
  assert_eq "hook script exists" "yes" "$exists"
  # Invocation forms, not the bare word: the session record is named
  # claude-reflection-ask.session, which the word alone would hit.
  code=$(grep -v '^[[:space:]]*#' "$HOOK" 2>/dev/null || true)
  assert_not_contains "no bare claude invocation" "claude " "$code"
  assert_not_contains "no claude backtick substitution" '`claude' "$code"
  assert_not_contains "no claude command substitution" '$(claude' "$code"
}

echo "=== reflection-ask.sh tests ==="
test_second_call_in_same_session_is_silent
test_new_session_returns_systemMessage
test_question_leaves_nothing_when_there_is_nothing
test_additionalcontext_path_has_real_file
test_subdirectory_resolves_to_repository_root
test_outside_a_repository_is_silent
test_write_is_delegated_to_a_subagent
test_script_never_launches_claude

report_results
