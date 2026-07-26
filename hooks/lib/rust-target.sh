#!/bin/zsh
# Shared .rs target resolution for the rust-*-edit hooks. Reads the hook JSON from
# stdin and prints the cargo workspace root of the first .rs path it references.
# Returns 1 when the input has no .rs path or the path is outside a git repo, so
# callers can exit without running cargo.
#
# Usage: root=$(rust_target_root) || exit 0

rust_target_root() {
  # Fast-exit: skip the jq+grep forks unless the input references a .rs file path
  local input f root
  input=$(cat)
  case "$input" in
    *.rs*) ;;
    *) return 1 ;;
  esac

  f=$(printf '%s' "$input" | jq -r '.tool_input.file_path, (.tool_input.edits[]?.file_path // empty)' \
    | grep '\.rs$' | head -1)
  [[ -n "$f" ]] || return 1

  root=$(git -C "$(dirname "$f")" rev-parse --show-toplevel 2>/dev/null)
  [[ -n "$root" ]] || return 1

  printf '%s' "$root"
}
