#!/bin/zsh
# PostToolUse hook: warn when a .ja/ source file carries prose with no Japanese in it.
#
# .ja/ is canonical and its prose (comments / docstrings) is written in Japanese, while
# code structure and identifiers stay identical to the English side. Agents default to
# writing comments in English, so a full-file Write silently replaces existing Japanese
# prose. That regression has landed 4 times, twice inside commits that claimed to be
# mechanical style-only changes, and a diff review does not catch it.
#
# Warns, never blocks: a file whose comments are legitimately all identifiers or proper
# nouns has no Japanese to find, and that is not a defect.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/japanese-detect.sh"

input=$(cat)

# Fast-exit before forking jq: only .ja/ paths can trigger this.
case "$input" in
  *.ja/*) ;;
  *) exit 0 ;;
esac

read -r tool_name file_path < <(printf '%s' "$input" | jq -r '[.tool_name // "", .tool_input.file_path // ""] | @tsv' 2>/dev/null) || true

case "$tool_name" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac
[[ -z "$file_path" ]] && exit 0
[[ ! -f "$file_path" ]] && exit 0

# Path must be under a .ja/ directory, not merely contain the string.
case "$file_path" in
  */.ja/*) ;;
  *) exit 0 ;;
esac

# Extensions whose prose the mirror convention translates. Markdown is covered by
# textlint; this guard is for source files where comments are the only prose.
case "$file_path" in
  *.py|*.js|*.ts|*.sh) ;;
  *) exit 0 ;;
esac

# Prose lines only: line comments, block-comment bodies, and Python docstring delimiters.
# Counting the whole file would pass on any file holding a Japanese string literal.
prose=$(LC_ALL=en_US.UTF-8 grep -E '^\s*(#|//|\*|"""|'"'''"')' "$file_path" 2>/dev/null || true)

# No prose at all means nothing to translate (a pure-code identical copy).
[[ -z "$prose" ]] && exit 0

# Shebang and coding lines are not prose.
prose=$(printf '%s\n' "$prose" | grep -v -E '^#!|^# -\*- coding' || true)
[[ -z "$prose" ]] && exit 0

# Threshold 1: a single Japanese character anywhere in the prose clears this guard. The
# target is a wholesale replacement, not partial drift.
if printf '%s' "$prose" | has_japanese 1; then
  exit 0
fi

prose_lines=$(printf '%s\n' "$prose" | grep -c . || true)

# stdout の JSON で返す。exit 0 の stderr は誰にも表示されないので、警告がそこに
# 出るだけでは退行を止められない。systemMessage が人間に、additionalContext が
# 書き換えた本人に届く。
msg=".ja/ は canonical で prose は日本語 (MIRROR.md)。$file_path のコメント / docstring ${prose_lines} 行に日本語が 1 文字もない。英語で書き直していないか確認する。過去訳は git log --oneline -- \"$file_path\" から取れる。"

jq -n --arg m "$msg" '{
  systemMessage: $m,
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $m
  }
}'
exit 0
