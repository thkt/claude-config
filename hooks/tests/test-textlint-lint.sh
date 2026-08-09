#!/usr/bin/env bash
# Integration tests for textlint-lint.sh (PreToolUse hook)
# The hook is exec'd directly (shebang zsh) — running it under bash masks
# zsh-specific behavior (echo backslash expansion, no word splitting)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"
HOOK="$SCRIPT_DIR/../textlint-lint.sh"

# A body textlint always flags: it carries the redundant することができます and clears the
# 50-character bar has_japanese sets. Raising either threshold moves both together.
LINTED_BODY='この機能はユーザーが設定を変更することができます。この説明は日本語判定の五十文字閾値を超えるための追加の文章です。'

test_issue_create_advisory() {
  echo "T-006: gh issue create with problematic body returns textlint findings"
  # ≥50 Japanese chars (has_japanese threshold) with a deterministic finding (redundant expression)
  local body="$LINTED_BODY"
  local cmd="gh issue create --title \"test\" --body \"$body\""
  local json
  json=$(make_bash_json "$cmd")
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_contains "returns hookSpecificOutput" "hookSpecificOutput" "$output"
  assert_contains "names the PreToolUse event" "PreToolUse" "$output"
  assert_not_contains "no top-level decision" '"decision"' "$output"
  assert_contains "has textlint findings" "textlint 校正結果" "$output"
  assert_contains "has structure checklist" "構造レビュー" "$output"
  # A real newline encodes as \n in JSON, an unexpanded one as \\n.
  assert_not_contains "newlines are expanded" '\\n' "$output"
}

test_issue_create_clean() {
  echo "T-007: gh issue create with clean body returns structure checklist only"
  local body='テストです。'
  local cmd="gh issue create --title \"test\" --body \"$body\""
  local json
  json=$(make_bash_json "$cmd")
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_contains "has structure checklist" "構造レビュー" "$output"
  assert_contains "returns hookSpecificOutput" "additionalContext" "$output"
  assert_not_contains "no textlint findings" "textlint 校正結果" "$output"
}

test_tmpdir_trailing_slash() {
  echo "T-019: TMPDIR が末尾スラッシュ付きでも一時ファイルのパスが指摘に残らない"
  # macOS が渡す TMPDIR は末尾スラッシュ付き。走らせる環境の TMPDIR が既にその形の場合が
  # あるので 2 つ足し、剥ぎ取りが 1 つで止まらないことまで見る。
  local body="$LINTED_BODY"
  local cmd="gh issue create --title \"test\" --body \"$body\""
  local json
  json=$(make_bash_json "$cmd")
  local output
  output=$(echo "$json" | TMPDIR="${TMPDIR:-/tmp}//" "$HOOK" 2>/dev/null) || true
  assert_contains "has textlint findings" "textlint 校正結果" "$output"
  assert_not_contains "no temp file path" "body.md" "$output"
}

test_non_gh_command_skipped() {
  echo "T-008: git status is skipped"
  local json='{"tool_name":"Bash","tool_input":{"command":"git status"}}'
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_empty "no output for git status" "$output"
}

test_pr_create_advisory() {
  echo "T-010: gh pr create with problematic body returns advisory"
  local body="$LINTED_BODY"
  local cmd="gh pr create --title \"test\" --body \"$body\""
  local json
  json=$(make_bash_json "$cmd")
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_contains "outputs advisory" "additionalContext" "$output"
  assert_contains "has textlint findings" "textlint 校正結果" "$output"
}

test_pr_create_multiline_body() {
  echo "T-015: gh pr create with multiline body still lints (zsh echo regression)"
  local body=$'一行目は複数行の本文が正しく抽出されることを確認する文です。\nこれは、二行目、で、読点、が、多す、ぎます。\n三行目は日本語判定の五十文字閾値を確実に超えるための追加の文章です。'
  local cmd="gh pr create --title \"test\" --body \"$body\""
  local json
  json=$(make_bash_json "$cmd")
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_contains "has textlint findings" "textlint 校正結果" "$output"
  assert_contains "flags max-ten" "max-ten" "$output"
}

test_commit_heredoc_advisory() {
  echo "T-016: git commit heredoc message with findings returns advisory without checklist"
  local cmd=$'git commit -m "$(cat <<\'EOF\'\nfix(hooks): 処理を行うことが出来ます\n\nこれは、テスト、です、が、読点、が、多すぎ、ます。\nEOF\n)"'
  local json
  json=$(make_bash_json "$cmd")
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_contains "has textlint findings" "textlint 校正結果" "$output"
  assert_contains "labels commit message" "commit message" "$output"
  assert_not_contains "no structure checklist for commit" "構造レビュー" "$output"
}

test_commit_inline_advisory() {
  echo "T-017: git commit -m inline message with findings returns advisory"
  local cmd='git commit -m "fix: これは、読点、が、多い、修正、です。"'
  local json
  json=$(make_bash_json "$cmd")
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_contains "has textlint findings" "textlint 校正結果" "$output"
}

test_commit_clean_silent() {
  echo "T-018: clean git commit message stays silent"
  local cmd='git commit -m "fix(hooks): commit message の textlint 対応を追加する"'
  local json
  json=$(make_bash_json "$cmd")
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_empty "no output for clean commit" "$output"
}

test_non_bash_tool_skipped() {
  echo "T-012: Write tool is skipped"
  local json='{"tool_name":"Write","tool_input":{"file_path":"/some/file.md"}}'
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_empty "no output for Write tool" "$output"
}

test_no_body_skipped() {
  echo "T-013: gh issue create without --body is skipped"
  local json='{"tool_name":"Bash","tool_input":{"command":"gh issue create --title \"test\""}}'
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_empty "no output without --body" "$output"
}

test_english_body_structure_only() {
  echo "T-014: English body gets structure checklist only (no textlint)"
  local body='This is an English issue body with enough content to verify that textlint does not run on non-Japanese text. The structure review should still appear.'
  local cmd="gh issue create --title \"test\" --body \"$body\""
  local json
  json=$(make_bash_json "$cmd")
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_contains "has structure checklist" "構造レビュー" "$output"
  assert_contains "returns hookSpecificOutput" "additionalContext" "$output"
}

with_body_file() {
  local dir body_path
  dir=$(mktemp -d "${TMPDIR:-/tmp}/textlint-bodyfile-XXXXXX")
  body_path="$dir/body.md"
  printf '%s\n' "$LINTED_BODY" > "$body_path"
  printf '%s' "$body_path"
}

test_issue_create_body_file() {
  echo "T-020: gh issue create の --body-file が指す本文が校正される"
  # /issue も /pr も --body-file で起票する。この経路を読まないと、実際に走る形の起票が
  # 一度も校正されない。
  local body_path
  body_path=$(with_body_file)
  local cmd="gh issue create --title \"test\" --body-file $body_path"
  local json
  json=$(make_bash_json "$cmd")
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_contains "has textlint findings" "textlint 校正結果" "$output"
  assert_contains "has structure checklist" "構造レビュー" "$output"
  rm -rf "$(dirname "$body_path")"
}

test_pr_create_body_file() {
  echo "T-021: gh pr create の --body-file が指す本文が校正される"
  local body_path
  body_path=$(with_body_file)
  local cmd="gh pr create --title \"test\" --body-file $body_path"
  local json
  json=$(make_bash_json "$cmd")
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_contains "has textlint findings" "textlint 校正結果" "$output"
  rm -rf "$(dirname "$body_path")"
}

test_quoted_body_file() {
  echo "T-023: 引用符で囲まれた --body-file のパスも読む"
  # 空白を含むパスは引用符付きで渡される。抽出の分岐がその形を先に拾えないと、
  # 塞がっていたときと同じ静かな素通しになる。
  local root dir body_path
  root=$(mktemp -d "${TMPDIR:-/tmp}/textlint-quoted-XXXXXX")
  dir="$root/with space"
  mkdir -p "$dir"
  body_path="$dir/body.md"
  printf '%s\n' "$LINTED_BODY" > "$body_path"
  local json
  json=$(make_bash_json "gh issue create --title \"test\" --body-file \"$body_path\"")
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_contains "has textlint findings" "textlint 校正結果" "$output"
  rm -rf "$root"
}

test_relative_body_file_skipped() {
  echo "T-022: --body-file が相対パスのときは校正しない"
  # hook はコマンドが走る cwd を持たないので、相対パスの指す先を決められない。
  # issue-body-template がリテラルの絶対パスを強制していて、そちらが実際に走る形になる。
  local json
  json=$(make_bash_json 'gh issue create --title "test" --body-file body.md')
  local output
  output=$(echo "$json" | "$HOOK" 2>/dev/null) || true
  assert_empty "no output for a relative --body-file" "$output"
}

echo "=== textlint-lint.sh tests ==="
test_issue_create_advisory
test_issue_create_body_file
test_pr_create_body_file
test_quoted_body_file
test_relative_body_file_skipped
test_issue_create_clean
test_tmpdir_trailing_slash
test_non_gh_command_skipped
test_pr_create_advisory
test_pr_create_multiline_body
test_commit_heredoc_advisory
test_commit_inline_advisory
test_commit_clean_silent
test_non_bash_tool_skipped
test_no_body_skipped
test_english_body_structure_only

report_results
