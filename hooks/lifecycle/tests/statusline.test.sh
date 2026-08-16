#!/usr/bin/env bash
# Tests for lifecycle/statusline.sh
#
# Only the state sweep is covered. The render_* functions write escape sequences whose
# assertions would restate the code, but the sweep unlinks files by mtime, and a defect there
# removes the wrong ones with nothing to restore them from.
#
# The state directory is swapped through CLAUDE_STATE_DIR rather than HOME: the script also
# runs `git rev-parse` against the real tree, and a home the test just created would change
# what that resolves to.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../tests/helpers.sh"
HOOK="$SCRIPT_DIR/../statusline.sh"

TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/statusline-tests-XXXXXX")
trap 'rm -rf "$TEST_TMPDIR"' EXIT

run_hook() {
  local state_dir="$1" session="$2" tokens="${3:-120000}" payload
  payload=$(jq -nc --arg s "$session" --argjson t "$tokens" \
    '{session_id:$s, context_window:{total_input_tokens:$t, context_window_size:200000, used_percentage:11}}')
  printf '%s' "$payload" | CLAUDE_STATE_DIR="$state_dir" zsh "$HOOK" >/dev/null 2>&1
}

# BSD date takes -v, GNU date takes -d. A CI runner has the latter, so try both.
days_ago() { date -v-"$1"d +%Y%m%d%H%M 2>/dev/null || date -d "$1 days ago" +%Y%m%d%H%M; }
aged() { touch -t "$(days_ago "$1")" "$2"; }

exists() { [[ -e "$1" ]] && echo yes || echo no; }

fresh_dir() { mktemp -d "$TEST_TMPDIR/stateXXXXXX"; }

echo "statusline: state sweep"

dir=$(fresh_dir)
aged 30 "$dir/context-old.state"
run_hook "$dir" sweep-1
assert_eq "removes a state file 30 days old" "no" "$(exists "$dir/context-old.state")"

dir=$(fresh_dir)
aged 3 "$dir/context-recent.state"
run_hook "$dir" sweep-2
assert_eq "keeps a state file 3 days old" "yes" "$(exists "$dir/context-recent.state")"

dir=$(fresh_dir)
aged 30 "$dir/changelog.md"
run_hook "$dir" sweep-3
assert_eq "keeps an aged file outside the context-*.state glob" "yes" "$(exists "$dir/changelog.md")"

dir=$(fresh_dir)
run_hook "$dir" sweep-4
aged 30 "$dir/context-added-later.state"
run_hook "$dir" sweep-4
assert_eq "leaves an aged file when the session already rendered once" \
  "yes" "$(exists "$dir/context-added-later.state")"

echo ""
echo "statusline: state file"

dir=$(fresh_dir)
run_hook "$dir" sweep-5
assert_eq "writes this session's state file" "yes" "$(exists "$dir/context-sweep-5.state")"
assert_eq "stores the token count" "120000" "$(cat "$dir/context-sweep-5.state" 2>/dev/null)"

dir="$TEST_TMPDIR/absent/cache"
run_hook "$dir" sweep-6
assert_eq "creates the state directory on first render" "yes" "$(exists "$dir/context-sweep-6.state")"

dir=$(fresh_dir)
printf '{"session_id":"sweep-7"}' | CLAUDE_STATE_DIR="$dir" zsh "$HOOK" >/dev/null 2>&1
assert_eq "writes the state file even when the payload carries no token count" \
  "yes" "$(exists "$dir/context-sweep-7.state")"

dir=$(fresh_dir)
run_hook "$dir" sweep-8 50000
run_hook "$dir" sweep-8 90000
assert_eq "overwrites the state file with the latest token count" \
  "90000" "$(cat "$dir/context-sweep-8.state" 2>/dev/null)"

echo ""
echo "statusline: payload without a session id"

dir=$(fresh_dir)
aged 30 "$dir/context-old.state"
printf '{"context_window":{"total_input_tokens":120000}}' \
  | CLAUDE_STATE_DIR="$dir" zsh "$HOOK" >/dev/null 2>&1
assert_eq "does not sweep when the payload carries no session id" \
  "yes" "$(exists "$dir/context-old.state")"
assert_eq "writes no state file when the payload carries no session id" \
  "1" "$(ls "$dir" | wc -l | tr -d ' ')"

dir=$(fresh_dir)
aged 30 "$dir/context-old.state"
printf '{"session_id":"../escape"}' | CLAUDE_STATE_DIR="$dir" zsh "$HOOK" >/dev/null 2>&1
assert_eq "does not sweep when the session id fails validation" \
  "yes" "$(exists "$dir/context-old.state")"

report_results
