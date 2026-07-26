#!/bin/zsh
# Rust: run cargo clippy before editing .rs files
# Outputs lint errors as additionalContext so Claude can fix them during the edit.
set +e

source "$(cd "$(dirname "$0")" && pwd)/lib/rust-target.sh"

root=$(rust_target_root) || exit 0
cd "$root" && cargo clippy --color never 2>&1 | head -40 \
  | jq -Rs '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": .}}'
