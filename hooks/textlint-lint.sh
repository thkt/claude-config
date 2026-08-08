#!/bin/zsh
# PreToolUse hook: lint text for gh issue/pr create (+ structure review checklist) and git commit
# Returns the findings as additionalContext; checklist is issue/pr only
set -euo pipefail

TEXTLINT_DIR="$HOME/.claude/hooks/textlint"
TEXTLINT_CONFIG="$TEXTLINT_DIR/.textlintrc.json"

# Not a top-level decision / additionalContext pair: PreToolUse reads context only out of
# hookSpecificOutput, so findings written at that level reach no one.
advise() {
  jq -nc --arg c "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: $c
    }
  }'
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/japanese-detect.sh"

# $'...', not '...': jq --arg passes the string through as written, so an unexpanded `\n`
# arrives as two characters and collapses the table into one line.
STRUCTURE_CHECKLIST=$'## 構造レビュー（ワークスロップ防止）\n\nbody を送信する前に、以下を確認してください：\n\n| チェック | 問い |\n|---|---|\n| 筆者の判断 | 筆者自身の結論が1〜3行で冒頭に書かれているか？AI出力が主役になっていないか |\n| 半分にできるか | この文書は半分にできるか？できないなら何が重要か分かっていない可能性がある |\n| 事実と意見の区別 | 事実・推測・提案にラベルが貼られ、分離されているか |\n| アクションの明確さ | 読み手に求める行動が具体的か（「ご確認ください」ではなく「Xを判断してください」） |\n| 読み手の認知負荷 | この文書は読み手の負荷を下げているか、仕事を押し付けていないか |\n\n問題がある項目のみ body を修正してください。'

input=$(cat)

# Fast-exit: skip jq+grep forks unless input is a Bash `gh ... create` or `git commit` call
case "$input" in
  *'"tool_name":"Bash"'*gh*create* | *'"tool_name":"Bash"'*git*commit*) ;;
  *) exit 0 ;;
esac

# printf, not echo: zsh echo expands backslash escapes and corrupts the JSON (\n inside strings)
read -r tool_name command_str < <(printf '%s' "$input" | jq -r '[.tool_name // "", .tool_input.command // ""] | @tsv' 2>/dev/null) || true
# @tsv doubles backslashes — undo to get original command string
command_str="${command_str//\\\\/\\}"

if [[ -z "$command_str" ]]; then
  exit 0
fi

mode=""
if [[ "$command_str" =~ gh[[:space:]]+(issue|pr)[[:space:]]+create ]]; then
  mode="ghcreate"
elif [[ "$command_str" =~ git[[:space:]]+commit ]]; then
  mode="commit"
else
  exit 0
fi

if [[ "$mode" == "ghcreate" ]]; then
  body=$(printf '%s\n' "$command_str" | sed -nE 's/.*--body "(([^"\\]|\\.)*)".*/\1/p')
  if [[ -z "$body" ]]; then
    body=$(printf '%s\n' "$command_str" | sed -nE "s/.*--body '([^']*)'.*/\1/p")
  fi
  # The extracted body still carries \n escape sequences from the flattened command; expand them
  if [[ -n "$body" ]]; then
    body=$(printf '%b' "$body")
  fi
else
  # Commit messages are usually multiline heredocs; @tsv flattens newlines, so re-extract raw
  command_raw=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null) || true
  body=$(printf '%s\n' "$command_raw" | awk "/<<'EOF'/{flag=1;next}/^EOF\$/{flag=0}flag")
  if [[ -z "$body" ]]; then
    body=$(printf '%s\n' "$command_raw" | sed -nE 's/.*-m "(([^"\\]|\\.)*)".*/\1/p')
  fi
  if [[ -z "$body" ]]; then
    body=$(printf '%s\n' "$command_raw" | sed -nE "s/.*-m '([^']*)'.*/\1/p")
  fi
fi

if [[ -z "$body" ]]; then
  exit 0
fi

ja_threshold=""
[[ "$mode" == "commit" ]] && ja_threshold=10

lint_section=""
if [[ -f "$TEXTLINT_CONFIG" ]] && printf '%s' "$body" | has_japanese $ja_threshold; then
  # BSD mktemp only substitutes trailing X's, so make a temp dir and put the .md inside.
  # The path removal below compares whole lines, and macOS hands over TMPDIR with a trailing
  # slash, so a `//` left in this path would never match what textlint prints.
  tmp_root="${TMPDIR:-/tmp}"
  while [[ "$tmp_root" == */ ]]; do tmp_root="${tmp_root%/}"; done
  tmpdir=$(mktemp -d "$tmp_root/textlint-lint-XXXXXX")
  tmpfile="$tmpdir/body.md"
  trap 'rm -rf "$tmpdir"' EXIT
  printf '%s\n' "$body" > "$tmpfile"

  # Array, not string: zsh does not word-split "$runner", so "bun x" would run as one command name
  if command -v bun &>/dev/null; then
    runner=(bun x)
  else
    runner=(npx)
  fi

  cd "$TEXTLINT_DIR" || exit 0
  lint_output=$("${runner[@]}" textlint --config "$TEXTLINT_CONFIG" "$tmpfile" 2>/dev/null) || true

  target_label="body"
  [[ "$mode" == "commit" ]] && target_label="commit message"

  if [[ -n "$lint_output" ]]; then
    lint_clean=$(printf '%s\n' "$lint_output" | grep -v "^$tmpfile$" | sed "s|$tmpfile|$target_label|g")
    lint_section=$(printf '## textlint 校正結果\n\n以下の指摘を確認し、必要に応じて %s テキストを修正してください。\n\n%s\n\n' "$target_label" "$lint_clean")
  fi
fi

if [[ "$mode" == "commit" ]]; then
  # No structure checklist for commits; stay silent when there is nothing to fix
  if [[ -z "$lint_section" ]]; then
    exit 0
  fi
  advise "$lint_section"
else
  advise "${lint_section}${STRUCTURE_CHECKLIST}"
fi
