#!/bin/zsh
# PreToolUse hook: match a gh issue create body against the skeleton its title's type
# points at, and stop the filing when the two diverge.
# Hands the --body-file contents and the title to skills/issue/scripts/validate-issue-body.py.
# Every state that leaves the body uncompared denies the filing alongside a body the
# validator rejects, since skipping the comparison is the same escape this hook exists to
# close. Each reason names the way out of the state it stops.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VALIDATOR="$SCRIPT_DIR/../skills/issue/scripts/validate-issue-body.py"

# Not a top-level `decision`: PreToolUse accepts only "block" there, so an "approve" written
# at that level asserts a permission the harness never grants.
deny() {
  jq -nc --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
}

input=$(cat)

# Fast-exit: an input carrying all three words might be a filing. The strict check below
# decides; this only keeps the jq fork off everything else.
case "$input" in
  *'"tool_name":"Bash"'*gh*issue*create*) ;;
  *) exit 0 ;;
esac

# printf, not echo: zsh echo expands backslash escapes and corrupts the JSON (\n inside strings)
# Read the command whole rather than through `@tsv` + `read -r`, which would turn the newlines
# separating a multi-command call into the two characters `\n`. The split below reads those
# newlines as command boundaries, so flattening them hides a filing written after a variable
# assignment. `|| command_str=""` keeps a jq failure from ending the hook non-zero under
# `set -e`, which lets the filing through as a hook error.
command_str=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null) || command_str=""

if [[ -z "$command_str" ]]; then
  exit 0
fi

# `gh issue create` names a filing only where it leads a command. The same words turn up
# inside commit messages (e7db3385 in this repository carries them) and inside a heredoc
# body a message is written through, so telling a filing from a mention takes a scan that
# knows where a token sits. The flags come out of the filing itself, since a `git commit`
# sharing the line carries its own --title-looking text.
if ! parsed=$(printf '%s' "$command_str" | LIB_DIR="$SCRIPT_DIR/lib" python3 -c '
import json
import os
import sys

sys.path.insert(0, os.environ["LIB_DIR"])
import command_scan

try:
    found = list(command_scan.commands(sys.stdin.read()))
except ValueError:
    sys.exit(1)  # quoting that does not close hides where the filing would begin

filing = next((c for c in found if command_scan.starts_with(c, ["gh", "issue", "create"])), None)
directory = next((c for c in found if c[0] == "cd" and len(c) > 1), None)
print(json.dumps({
    "filing": filing is not None,
    "title": command_scan.flag_value(filing, "--title") if filing else None,
    "body_file": command_scan.flag_value(filing, "--body-file") if filing else None,
    "repo_dir": directory[1] if directory else None,
}))
' 2>/dev/null); then
  # Without the scan nothing identifies the filing, so the body goes uninspected the same
  # way an unreadable body file leaves it uninspected.
  deny "issue-body-template: コマンドを解析できず起票を照合できない。python3 が動くか、引用符が閉じているかを確認する"
  exit 0
fi

# `|| true` on each read: a value that is absent comes through as an empty line, and the
# command substitution strips it along with the trailing newline, so the reads that follow
# hit EOF and return 1, which would end the hook under `set -e`.
{
  read -r is_filing || true
  read -r title || true
  read -r body_file || true
  read -r repo_dir || true
} <<< "$(printf '%s' "$parsed" | jq -r '(.filing | tostring), (.title // ""), (.body_file // ""), (.repo_dir // "")')"

if [[ "$is_filing" != "true" ]]; then
  exit 0
fi

if [[ -z "$title" ]] || ! [[ "$title" =~ "^\[([A-Za-z]+)\]" ]]; then
  deny "issue-body-template: タイトルに型プレフィックス ([Bug] 等) が無く、どの骨格と照合するかを決められない。タイトルを型で始める"
  exit 0
fi
issue_type="${match[1]:l}"

# The repository's own template wins: that is what the web UI files against, and a CLI
# filing that ignores it would leave two shapes of the same issue type in one tracker.
# The command's own `cd` names the repository when there is one; otherwise this hook
# already runs where the tool call would.
[[ -z "$repo_dir" ]] && repo_dir="$PWD"

if [[ -z "$body_file" ]]; then
  deny "issue-body-template: 本文が --body のインライン指定で骨格と照合できない。本文を一時ファイルへ書き --body-file にリテラルの絶対パスで渡す"
  exit 0
fi

[[ "$body_file" = /* ]] || body_file="$repo_dir/$body_file"

# A hook carries none of the shell state the command will run under, so a path written as
# `"$B"` or `$TMPDIR/body.md` arrives unexpanded and names nothing on disk.
if [[ ! -f "$body_file" ]]; then
  deny "issue-body-template: --body-file の指す先 ($body_file) が読めず本文を照合できない。パスを変数でなくリテラルの絶対パスで書く"
  exit 0
fi

template=""
for candidate in \
  "$repo_dir/.github/ISSUE_TEMPLATE/${issue_type}.yml" \
  "$repo_dir/.github/ISSUE_TEMPLATE/${issue_type}.yaml" \
  "$repo_dir/.github/ISSUE_TEMPLATE/${issue_type}.md" \
  "$SCRIPT_DIR/../skills/issue/templates/${issue_type}.md"; do
  if [[ -f "$candidate" ]]; then
    template="$candidate"
    break
  fi
done

if [[ -z "$template" ]]; then
  known=$(ls "$SCRIPT_DIR/../skills/issue/templates/" 2>/dev/null | sed 's/\.md$//' | paste -sd, -) || known=""
  choices=""
  [[ -n "$known" ]] && choices="型を $known のいずれかにするか、"
  deny "issue-body-template: 型 [$issue_type] に対応する骨格が .github/ISSUE_TEMPLATE/ にも skills/issue/templates/ にも無く本文を照合できない。${choices}skills/issue/templates/${issue_type}.md を足す"
  exit 0
fi

# The validator exits 1 both for a rejected body and for its own crash, since an uncaught
# Python exception exits 1 too. The contract that separates them is the JSON on stdout.
# stderr stays unredirected so a traceback reaches the debug log.
validate_output=$(python3 "$VALIDATOR" "$template" "$title" "$body_file") || true
errors_type=$(printf '%s' "$validate_output" | jq -r '.errors | type' 2>/dev/null) || errors_type=""

if [[ "$errors_type" != "array" ]]; then
  deny "issue-body-template: validator ($VALIDATOR) が errors 配列を返さず本文を照合できない。python3 で直接実行して出力を確かめる"
  exit 0
fi

reason=$(printf '%s' "$validate_output" | jq -r '.errors | join("; ")' 2>/dev/null) || reason=""
if [[ -n "$reason" ]]; then
  deny "issue-body-template: 本文の節構成が骨格と食い違う ($reason)"
fi
