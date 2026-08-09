#!/usr/bin/env bash
# Integration tests for security/rm-to-trash.sh (PreToolUse hook)
# The hook is exec'd directly (shebang zsh) — running it under bash masks
# zsh-specific behavior
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"
HOOK="$SCRIPT_DIR/../security/rm-to-trash.sh"

# The value alone, so the assertion survives jq switching between -c and pretty output.
DENY_MARK='"deny"'

# The rows come from the matrix measured in #349.
assert_denied() {
  local name="$1" cmd="$2" output
  output=$(make_bash_json "$cmd" | "$HOOK" 2>/dev/null) || true
  assert_contains "$name" "$DENY_MARK" "$output"
}

assert_allowed() {
  local name="$1" cmd="$2" output
  output=$(make_bash_json "$cmd" | "$HOOK" 2>/dev/null) || true
  assert_not_contains "$name" "$DENY_MARK" "$output"
}

test_direct_deletion() {
  echo "T-001: コマンド先頭の削除は止める"
  assert_denied "bare deletion" 'rm -rf /tmp/x'
  assert_denied "rmdir" 'rmdir /tmp/x'
  assert_denied "unlink" 'unlink /tmp/x'
  assert_denied "shred" 'shred /tmp/x'
}

test_second_line_deletion() {
  echo "T-002: 2 行目以降に置かれた削除も止める"
  assert_denied "after a newline" 'cd /tmp
rm -rf x'
}

test_wrapped_deletion() {
  echo "T-003: ラッパー語ごしの削除も止める"
  assert_denied "sudo" 'sudo rm -rf /tmp/x'
  assert_denied "env" 'env rm /tmp/x'
  assert_denied "time" 'time rm -rf /tmp/x'
  assert_denied "absolute path" '/bin/rm -rf /tmp/x'
}

test_indirect_deletion() {
  echo "T-004: find と xargs 経由の削除も止める"
  assert_denied "find -exec" 'find . -name "*.tmp" -exec rm {} \;'
  assert_denied "xargs" 'find . -print0 | xargs -0 rm'
}

test_quoted_text_is_not_a_deletion() {
  echo "T-005: 引用符の内側にある語は削除として扱わない"
  assert_allowed "sed script" "sed -i '' 's|rm -rf x|y|g' f"
  assert_allowed "commit message" "git commit -m 'remove rm calls from the test'"
  assert_allowed "echoed text" "echo 'rm -rf danger' > note.txt"
}

test_heredoc_body_is_not_a_deletion() {
  echo "T-006: heredoc の本文にある削除語では止めない"
  assert_allowed "heredoc body" 'cat > /tmp/m.txt << '"'"'EOF'"'"'
rm -rf /tmp/x
EOF
git commit -F /tmp/m.txt'
}

test_unparsable_input_is_denied() {
  echo "T-007: 解析できないコマンドは止める側へ倒す"
  # 閉じない引用符では、どこがコマンド位置なのか決められない。security hook なので
  # 判断できないときは通さない。
  assert_denied "unterminated quote" 'rm -rf "/tmp/x'
}

test_unrelated_command_skipped() {
  echo "T-008: 削除語を含まないコマンドは何も返さない"
  local output
  output=$(make_bash_json 'git status' | "$HOOK" 2>/dev/null) || true
  assert_empty "no output for git status" "$output"
}

echo "=== rm-to-trash.sh tests ==="
test_direct_deletion
test_second_line_deletion
test_wrapped_deletion
test_indirect_deletion
test_quoted_text_is_not_a_deletion
test_heredoc_body_is_not_a_deletion
test_unparsable_input_is_denied
test_unrelated_command_skipped

report_results
