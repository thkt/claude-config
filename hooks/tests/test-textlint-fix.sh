#!/usr/bin/env bash
# Integration tests for textlint-fix.sh (PostToolUse hook)
# The hook is exec'd directly (shebang zsh) — running it under bash masks
# zsh-specific behavior (echo backslash expansion, no word splitting)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"
HOOK="$SCRIPT_DIR/../textlint-fix.sh"
# Template under $TMPDIR: macOS mktemp without a template ignores TMPDIR (uses confstr temp dir)
TMPDIR_BASE="$(mktemp -d "${TMPDIR:-/tmp}/textlint-fix-tests-XXXXXX")"

cleanup() { rm -rf "$TMPDIR_BASE"; }
trap cleanup EXIT

assert_textlint_fixes_md() {
  local tool_name="$1" label="$2"
  local tmpfile="$TMPDIR_BASE/test-${label}.md"
  cat > "$tmpfile" <<'EOF'
# テスト

この機能はユーザーが設定を変更することができます。また、管理者が権限を付与する事にしました。これにより、運用の効率化が期待されています。
EOF
  local json
  json=$(make_tool_json "$tool_name" "$tmpfile")
  echo "$json" | "$HOOK" 2>/dev/null
  local content
  content=$(cat "$tmpfile")
  assert_not_contains "removes redundant expression ($label)" "することができます" "$content"
}

test_md_write_fixes_file() {
  echo "T-003: .md Write triggers textlint --fix"
  assert_textlint_fixes_md "Write" "write"
}

test_ts_file_skipped() {
  echo "T-004: .ts file is skipped"
  local tmpfile="$TMPDIR_BASE/test.ts"
  echo "const x = 1;" > "$tmpfile"
  local json
  json=$(make_tool_json "Write" "$tmpfile")
  local output
  output=$(echo "$json" | "$HOOK" 2>&1)
  local exit_code=$?
  assert_eq "exit code 0" "0" "$exit_code"
  assert_eq "file unchanged" "const x = 1;" "$(cat "$tmpfile")"
}

test_read_tool_skipped() {
  echo "T-005: Read tool is skipped"
  local json
  json=$(make_tool_json "Read" "/some/file.md")
  local exit_code
  echo "$json" | "$HOOK" 2>/dev/null
  exit_code=$?
  assert_eq "exit code 0" "0" "$exit_code"
}

test_graceful_skip_no_textlint() {
  echo "T-009: graceful skip when textlint unavailable"
  local tmpfile="$TMPDIR_BASE/test-graceful.md"
  echo "# テスト" > "$tmpfile"
  local json
  json=$(make_tool_json "Write" "$tmpfile")
  # Override PATH to hide bun/npx/textlint
  local exit_code=0
  local jq_cmd jq_dir=""
  jq_cmd=$(command -v jq 2>/dev/null) || jq_cmd=$(command -v jaq 2>/dev/null) || true
  [[ -n "$jq_cmd" ]] && jq_dir=$(dirname "$jq_cmd")
  echo "$json" | PATH="/usr/bin:/bin${jq_dir:+:$jq_dir}" "$HOOK" >/dev/null 2>&1 || exit_code=$?
  assert_eq "does not crash" "0" "$exit_code"
}

test_md_edit_fixes_file() {
  echo "T-003: .md Edit triggers textlint --fix"
  assert_textlint_fixes_md "Edit" "edit"
}

test_multiedit_fixes_file() {
  echo "T-003: .md MultiEdit triggers textlint --fix"
  assert_textlint_fixes_md "MultiEdit" "multiedit"
}

test_english_md_skipped() {
  echo "T-011: English .md file is skipped"
  local tmpfile="$TMPDIR_BASE/test-english.md"
  cat > "$tmpfile" <<'EOF'
# English Document

This is a test document written entirely in English. It should not trigger textlint processing because it does not contain enough Japanese characters.
EOF
  local original
  original=$(cat "$tmpfile")
  local json
  json=$(make_tool_json "Write" "$tmpfile")
  echo "$json" | "$HOOK" 2>/dev/null
  assert_eq "english file unchanged" "$original" "$(cat "$tmpfile")"
}

echo "=== textlint-fix.sh tests ==="
test_md_write_fixes_file
test_ts_file_skipped
test_read_tool_skipped
test_graceful_skip_no_textlint
test_md_edit_fixes_file
test_multiedit_fixes_file
test_english_md_skipped

report_results
