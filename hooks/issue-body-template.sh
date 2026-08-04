#!/bin/zsh
# PreToolUse hook: gh issue create の body を骨格の節構成と突き合わせ、外れた起票を止める
# hooks/textlint-lint.sh と同じ形で PreToolUse Bash の入力から gh issue create を取り出し、
# --body-file の中身とタイトルを skills/issue/scripts/validate-issue-body.py へ渡す。
# errors が返ったときだけ hookSpecificOutput.permissionDecision を deny で返す (hooks/security/rm-to-trash.sh と同じ形)。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VALIDATOR="$SCRIPT_DIR/../skills/issue/scripts/validate-issue-body.py"

input=$(cat)

# Fast-exit: skip jq fork unless input is a Bash `gh issue create` call
case "$input" in
  *'"tool_name":"Bash"'*gh*issue*create*) ;;
  *) exit 0 ;;
esac

# printf, not echo: zsh echo expands backslash escapes and corrupts the JSON (\n inside strings)
read -r tool_name command_str < <(printf '%s' "$input" | jq -r '[.tool_name // "", .tool_input.command // ""] | @tsv' 2>/dev/null) || true
# @tsv doubles backslashes — undo to get original command string
command_str="${command_str//\\\\/\\}"

if [[ -z "$command_str" ]]; then
  exit 0
fi

if ! [[ "$command_str" =~ gh[[:space:]]+issue[[:space:]]+create ]]; then
  exit 0
fi

title=$(printf '%s\n' "$command_str" | sed -nE 's/.*--title "(([^"\\]|\\.)*)".*/\1/p')
if [[ -z "$title" ]]; then
  title=$(printf '%s\n' "$command_str" | sed -nE "s/.*--title '([^']*)'.*/\1/p")
fi

if [[ -z "$title" ]] || ! [[ "$title" =~ "^\[([A-Za-z]+)\]" ]]; then
  jq -nc --arg r "issue-body-template: タイトルに型プレフィックス ([Bug] 等) が無く骨格の照合ができないため素通しした" \
    '{"decision":"approve","reason":$r}'
  exit 0
fi
issue_type="${match[1]:l}"

body_file=$(printf '%s\n' "$command_str" | sed -nE "s/.*--body-file[[:space:]]+('([^']*)'|\"([^\"]*)\"|([^ ]+)).*/\2\3\4/p")
if [[ -z "$body_file" ]]; then
  jq -nc --arg r "issue-body-template: --body がインライン指定で --body-file 経由ではないため骨格の照合ができず素通しした" \
    '{"decision":"approve","reason":$r}'
  exit 0
fi

template="$SCRIPT_DIR/../skills/issue/templates/${issue_type}.md"
if [[ ! -f "$template" ]]; then
  # リポジトリ独自テンプレートなど、対応する骨格が無い経路は検査対象外 (plan の Backlog candidates 参照)
  exit 0
fi

validate_output=$(python3 "$VALIDATOR" "$template" "$title" "$body_file" 2>/dev/null) || true
errors=$(printf '%s' "$validate_output" | jq -c '.errors // []' 2>/dev/null) || errors="[]"
error_count=$(printf '%s' "$errors" | jq 'length' 2>/dev/null) || error_count=0

if [[ "$error_count" -gt 0 ]]; then
  reason=$(printf '%s' "$errors" | jq -r 'join("; ")')
  jq -nc --arg r "issue-body-template: 本文の節構成が骨格と食い違う ($reason)" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
fi
