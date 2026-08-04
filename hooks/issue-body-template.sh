#!/bin/zsh
# PreToolUse hook: match a gh issue create body against the skeleton its title's type
# points at, and stop the filing when the two diverge.
# Hands the --body-file contents and the title to skills/issue/scripts/validate-issue-body.py.
# A body that cannot be read is denied alongside one the validator rejects, since a filing
# that skips the comparison is the same escape this hook exists to close.
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
# inside commit messages (e7db3385 in this repository carries them), and a message body can
# put them at the start of one of its own lines, so a split that counts every separator
# would drag an unrelated git commit through the validator. Telling which separators sit
# outside quotes takes a scanner that carries state, which sed cannot express.
if ! segments=$(printf '%s' "$command_str" | python3 -c '
import sys

# `&&` and `||` split as two single characters, which only leaves an empty segment
# between them.
command = sys.stdin.read()
segments, current, quote, escaped = [], [], None, False
for ch in command:
    if escaped:
        current.append(ch)
        escaped = False
    elif ch == "\\" and quote != "\x27":
        current.append(ch)
        escaped = True
    elif quote:
        current.append(ch)
        if ch == quote:
            quote = None
    elif ch in "\x27\"":
        current.append(ch)
        quote = ch
    elif ch in ";|&\n":
        segments.append("".join(current))
        current = []
    else:
        current.append(ch)
segments.append("".join(current))
sys.stdout.write("".join(segment + "\x00" for segment in segments))
' 2>/dev/null); then
  # Losing the split leaves no segment identified as the filing, so the body goes
  # uninspected the same way an unreadable body file leaves it uninspected.
  jq -nc --arg r "issue-body-template: コマンドの分割に失敗し起票を照合できない。python3 が動くか確認する" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
fi

create_segment=""
repo_segment=""
while IFS= read -r -d '' segment; do
  if [[ -z "$create_segment" ]] && [[ "$segment" =~ '^[[:space:]]*gh[[:space:]]+issue[[:space:]]+create([[:space:]]|$)' ]]; then
    create_segment="$segment"
  elif [[ -z "$repo_segment" ]] && [[ "$segment" =~ '^[[:space:]]*cd[[:space:]]' ]]; then
    repo_segment="$segment"
  fi
done <<< "$segments"

if [[ -z "$create_segment" ]]; then
  exit 0
fi

# The flags are read out of the filing segment rather than the whole command, since a
# `git commit` sharing the command line carries its own `--title`-looking text. `head -1`
# guards a quoted argument holding a newline, where sed prints one match per line, and
# `|| true` keeps the SIGPIPE that `head` sends from ending the hook under `set -o pipefail`.
title=$(printf '%s\n' "$create_segment" | sed -nE 's/.*--title "(([^"\\]|\\.)*)".*/\1/p' | head -1) || true
if [[ -z "$title" ]]; then
  title=$(printf '%s\n' "$create_segment" | sed -nE "s/.*--title '([^']*)'.*/\1/p" | head -1) || true
fi

if [[ -z "$title" ]] || ! [[ "$title" =~ "^\[([A-Za-z]+)\]" ]]; then
  jq -nc --arg r "issue-body-template: タイトルに型プレフィックス ([Bug] 等) が無く骨格の照合ができないため素通しした" \
    '{"decision":"approve","reason":$r}'
  exit 0
fi
issue_type="${match[1]:l}"

# The repository's own template wins: that is what the web UI files against, and a CLI
# filing that ignores it would leave two shapes of the same issue type in one tracker.
# The command's own `cd` names the repository when there is one; otherwise this hook
# already runs where the tool call would. A relative --body-file is read against the same
# directory, so this has to be settled before the body file is resolved.
repo_dir=$(printf '%s\n' "$repo_segment" | sed -nE 's/^[[:space:]]*cd[[:space:]]+([^ &;|]+).*/\1/p' | head -1) || true
[[ -z "$repo_dir" ]] && repo_dir="$PWD"

body_file=$(printf '%s\n' "$create_segment" | sed -nE "s/.*--body-file[[:space:]]+('([^']*)'|\"([^\"]*)\"|([^ ]+)).*/\2\3\4/p" | head -1) || true
if [[ -z "$body_file" ]]; then
  jq -nc --arg r "issue-body-template: --body がインライン指定で --body-file 経由ではないため骨格の照合ができず素通しした" \
    '{"decision":"approve","reason":$r}'
  exit 0
fi

[[ "$body_file" = /* ]] || body_file="$repo_dir/$body_file"

# A hook carries none of the shell state the command will run under, so a path written as
# `"$B"` or `$TMPDIR/body.md` arrives unexpanded and names nothing on disk.
if [[ ! -f "$body_file" ]]; then
  jq -nc --arg r "issue-body-template: --body-file の指す先 ($body_file) が読めず本文を照合できない。パスを変数でなくリテラルの絶対パスで書く" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
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
