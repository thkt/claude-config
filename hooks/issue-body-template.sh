#!/bin/zsh
# PreToolUse hook: match a gh issue create body against the skeleton its title's type
# points at, and stop the filing when the two diverge.
# Reads the Bash command out of the PreToolUse input the way hooks/textlint-lint.sh does,
# then hands the --body-file contents and the title to
# skills/issue/scripts/validate-issue-body.py. Only a non-empty errors list becomes a deny
# (same shape as hooks/security/rm-to-trash.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VALIDATOR="$SCRIPT_DIR/../skills/issue/scripts/validate-issue-body.py"

input=$(cat)

# Fast-exit: an input carrying all three words might be a filing. The strict check below
# decides; this only keeps the jq fork off everything else.
case "$input" in
  *'"tool_name":"Bash"'*gh*issue*create*) ;;
  *) exit 0 ;;
esac

# printf, not echo: zsh echo expands backslash escapes and corrupts the JSON (\n inside strings)
# tool_name is already filtered by the fast-exit case above, so only command is extracted here.
read -r command_str < <(printf '%s' "$input" | jq -r '[.tool_input.command // ""] | @tsv' 2>/dev/null) || true
# @tsv doubles backslashes — undo to get original command string
command_str="${command_str//\\\\/\\}"

if [[ -z "$command_str" ]]; then
  exit 0
fi

# `gh issue create` names a filing only where it leads a command. The same words turn up
# inside commit messages (e7db3385 in this repository carries them), so matching anywhere
# in the string drags an unrelated git commit through the validator. A separator inside
# quotes splits here too, but a split piece starts with `gh issue create` only when the
# filing command itself was quoted, and stopping on that is the safe side.
is_create=0
while IFS= read -r segment; do
  [[ "$segment" =~ '^[[:space:]]*gh[[:space:]]+issue[[:space:]]+create([[:space:]]|$)' ]] || continue
  is_create=1
  break
done < <(printf '%s\n' "$command_str" | sed -E 's/(&&|\|\||[;|])/\n/g')

if (( is_create == 0 )); then
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

# The repository's own template wins: that is what the web UI files against, and a CLI
# filing that ignores it would leave two shapes of the same issue type in one tracker.
# The command's own `cd` names the repository when there is one; otherwise this hook
# already runs where the tool call would.
repo_dir=$(printf '%s\n' "$command_str" | sed -nE 's/^[[:space:]]*cd[[:space:]]+([^ &;|]+).*/\1/p')
[[ -z "$repo_dir" ]] && repo_dir="$PWD"

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
  # No skeleton anywhere for this type, so there is nothing to compare the body against.
  exit 0
fi

validate_output=$(python3 "$VALIDATOR" "$template" "$title" "$body_file" 2>/dev/null) || true
# An empty join means the validator found nothing, could not run, or wrote no JSON. All
# three leave the filing alone, so one extraction covers both the test and the message.
reason=$(printf '%s' "$validate_output" | jq -r '.errors // [] | join("; ")' 2>/dev/null) || reason=""

if [[ -n "$reason" ]]; then
  jq -nc --arg r "issue-body-template: 本文の節構成が骨格と食い違う ($reason)" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
fi
