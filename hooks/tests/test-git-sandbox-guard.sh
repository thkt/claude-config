#!/usr/bin/env bash
# Integration tests for security/git-sandbox-guard.sh (PreToolUse hook)
# The hook is exec'd directly (shebang zsh) — running it under bash masks
# zsh-specific behavior
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"
HOOK="$SCRIPT_DIR/../security/git-sandbox-guard.sh"

# The value alone, so the assertion survives jq switching between -c and pretty output.
DENY_MARK='"deny"'

GUARDED_CWD="$HOME/.claude"
# Not a git repository, so the toplevel lookup finds no match and the guard stands down.
UNGUARDED_CWD="${TMPDIR:-/tmp}"

# The shared helper carries no cwd or sandbox flag, both of which this hook branches on.
make_guard_json() {
  local cmd="$1" cwd="${2:-$GUARDED_CWD}" escaped="${3:-false}"
  jq -nc --arg cmd "$cmd" --arg cwd "$cwd" --argjson escaped "$escaped" \
    '{"tool_name":"Bash","cwd":$cwd,"tool_input":{"command":$cmd,"dangerouslyDisableSandbox":$escaped}}'
}

run_hook() {
  make_guard_json "$@" | "$HOOK" 2>/dev/null || true
}

assert_denied() {
  local name="$1"
  shift
  assert_contains "$name" "$DENY_MARK" "$(run_hook "$@")"
}

assert_allowed() {
  local name="$1"
  shift
  assert_not_contains "$name" "$DENY_MARK" "$(run_hook "$@")"
}

test_tree_rewriting_is_denied() {
  echo "T-001: 作業ツリーを書き換える git は止める"
  assert_denied "checkout a branch" 'git checkout main'
  assert_denied "checkout a path" 'git checkout -- agents/x.md'
  assert_denied "switch a branch" 'git switch main'
  assert_denied "pull" 'git pull'
  assert_denied "pull with args" 'git pull --ff-only origin main'
  assert_denied "merge" 'git merge origin/main'
  assert_denied "rebase" 'git rebase main'
  assert_denied "reset --hard" 'git reset --hard origin/main'
  assert_denied "revert" 'git revert HEAD'
  assert_denied "cherry-pick" 'git cherry-pick abc1234'
  assert_denied "stash pop" 'git stash pop'
  assert_denied "restore" 'git restore agents/x.md'
  assert_denied "clean" 'git clean -fd'
}

test_index_only_and_branch_create_pass() {
  echo "T-002: ファイルを書かない git は通す"
  assert_allowed "branch create" 'git checkout -b docs/foo'
  assert_allowed "switch create" 'git switch -c docs/foo'
  assert_allowed "reset mixed" 'git reset --mixed origin/main'
  assert_allowed "reset soft" 'git reset --soft HEAD~1'
  assert_allowed "stash list" 'git stash list'
  assert_allowed "fetch" 'git fetch origin'
  assert_allowed "status" 'git status --short'
  assert_allowed "diff" 'git diff --stat'
  assert_allowed "push" 'git push -u origin HEAD'
}

test_escaped_call_passes() {
  echo "T-003: sandbox を外した呼び出しは通す"
  assert_allowed "escaped pull" 'git pull' "$GUARDED_CWD" true
}

test_other_repository_passes() {
  echo "T-004: 別のリポジトリは対象外"
  assert_allowed "pull outside the guarded repo" 'git pull' "$UNGUARDED_CWD"
}

test_quoted_text_is_not_a_call() {
  echo "T-005: 引用符の中の git はコマンドではない"
  assert_allowed "pull inside a commit message" 'git commit -m "git pull を追加"'
  assert_allowed "checkout inside an echo" 'echo "run git checkout main"'
}

test_unparsable_is_denied() {
  echo "T-006: 閉じられない行は fail-closed"
  assert_denied "unbalanced quote" 'git commit -m "unclosed'
}

test_non_git_passes() {
  echo "T-007: git 以外は素通り"
  assert_allowed "ls" 'ls -la'
  assert_allowed "gh" 'gh pr list'
}

test_tree_rewriting_is_denied
test_index_only_and_branch_create_pass
test_escaped_call_passes
test_other_repository_passes
test_quoted_text_is_not_a_call
test_unparsable_is_denied
test_non_git_passes
report_results
