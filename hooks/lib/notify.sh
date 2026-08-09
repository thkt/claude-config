#!/bin/zsh

# ${(%):-%x} is this file's own path. $0 names the caller in a sourced file, and
# $HOME/.claude names only the installed harness, not a checkout run from elsewhere.
SOUNDS_DIR="${${(%):-%x}:A:h:h:h}/sounds"

play_sound() {
  local file="$SOUNDS_DIR/$1" vol="${2:-0.1}"
  [[ -f "$file" ]] && afplay -volume "$vol" "$file" &
}
