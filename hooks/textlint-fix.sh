#!/bin/zsh
# PostToolUse hook: auto-fix .md files with textlint
# Triggered on Write/Edit/MultiEdit for markdown files
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/japanese-detect.sh"

# Not $HOME/.claude, which names the installed harness alone: a checkout run from
# anywhere else finds no config there.
TEXTLINT_DIR="$SCRIPT_DIR/textlint"
TEXTLINT_CONFIG="$TEXTLINT_DIR/.textlintrc.json"

input=$(cat)

# Fast-exit: skip jq fork unless input references a .md file path
case "$input" in
  *.md\"*) ;;
  *) exit 0 ;;
esac

# printf, not echo: zsh echo expands backslash escapes and corrupts the JSON (\n inside strings)
read -r tool_name file_path < <(printf '%s' "$input" | jq -r '[.tool_name // "", .tool_input.file_path // ""] | @tsv' 2>/dev/null) || true

case "$tool_name" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac
if [[ -z "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  *.md) ;;
  *) exit 0 ;;
esac

if [[ ! -f "$file_path" ]]; then
  exit 0
fi

if ! has_japanese < "$file_path"; then
  exit 0
fi

if [[ ! -f "$TEXTLINT_CONFIG" ]]; then
  echo "textlint-fix: config not found at $TEXTLINT_CONFIG" >&2
  exit 0
fi

# Array, not string: zsh does not word-split "$runner", so "bun x" would run as one command name
if command -v bun &>/dev/null; then
  runner=(bun x)
else
  runner=(npx)
fi

cd "$TEXTLINT_DIR" || exit 0
"${runner[@]}" textlint --fix --config "$TEXTLINT_CONFIG" "$file_path" >/dev/null 2>&1 || true

exit 0
