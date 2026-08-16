#!/usr/bin/env bash
# Integration tests for edit/rust_pre_edit.py, edit/rust_post_edit.py and lib/rust_target.py.
# cargo is replaced by a stub on PATH: the assertions read what the hooks do with clippy's
# output rather than compiling a real crate.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../tests/helpers.sh"
PRE="$SCRIPT_DIR/../rust_pre_edit.py"
POST="$SCRIPT_DIR/../rust_post_edit.py"

# Template under $TMPDIR: macOS mktemp without a template ignores TMPDIR
TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/rust-edit-tests-XXXXXX")
trap 'rm -rf "$TEST_TMPDIR"' EXIT

REPO="$TEST_TMPDIR/repo"
mkdir -p "$REPO/src"
git -C "$REPO" init -q
: > "$REPO/src/lib.rs"
: > "$REPO/src/other.rs"

STUB_BIN="$TEST_TMPDIR/bin"
mkdir -p "$STUB_BIN"
# Records the subcommand it was called with, and prints findings for two files so the
# ordering assertion has something to reorder.
cat > "$STUB_BIN/cargo" <<'STUB'
#!/bin/sh
echo "$1" >> "$CARGO_CALLS"
[ "$1" = "clippy" ] || exit 0
[ -n "$CARGO_SILENT" ] && exit 0
echo "src/other.rs:1:1: warning: unused variable"
echo "src/other.rs:2:1: warning: needless return"
echo "src/lib.rs:9:1: warning: this looks like the edited file"
exit 0
STUB
chmod +x "$STUB_BIN/cargo"

run_hook() {
  local hook="$1" path="$2"
  CARGO_CALLS="$TEST_TMPDIR/calls" PATH="$STUB_BIN:$PATH" \
    make_tool_json Edit "$path" | CARGO_CALLS="$TEST_TMPDIR/calls" PATH="$STUB_BIN:$PATH" "$hook" 2>/dev/null || true
}

reset_calls() { : > "$TEST_TMPDIR/calls"; }

test_a_non_rust_edit_never_starts_cargo() {
  echo "T-001: An edit to anything but .rs does not launch cargo"
  reset_calls
  assert_empty "markdown" "$(run_hook "$PRE" "$REPO/README.md")"
  assert_empty "cargo not launched" "$(cat "$TEST_TMPDIR/calls")"
}

test_a_rust_file_outside_a_repo_is_skipped() {
  echo "T-002: A .rs outside git control is out of scope"
  reset_calls
  : > "$TEST_TMPDIR/loose.rs"
  assert_empty "outside a repo" "$(run_hook "$PRE" "$TEST_TMPDIR/loose.rs")"
  assert_empty "cargo not launched" "$(cat "$TEST_TMPDIR/calls")"
}

test_the_edited_file_findings_come_first() {
  echo "T-003: Findings for the edited file lead the list"
  # clippy reads the whole workspace, so trimming can drop the file that was edited.
  local out first
  out=$(run_hook "$PRE" "$REPO/src/lib.rs")
  first=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext' | head -1)
  assert_contains "the edited file leads" "src/lib.rs" "$first"
}

test_pre_edit_declares_its_event() {
  echo "T-004: It returns as a PreToolUse"
  local out
  out=$(run_hook "$PRE" "$REPO/src/lib.rs")
  assert_eq "hookEventName" "PreToolUse" "$(printf '%s' "$out" | jq -r '.hookSpecificOutput.hookEventName')"
}

test_post_edit_formats_then_lints() {
  echo "T-005: After an edit, fmt runs and then clippy returns"
  reset_calls
  local out
  out=$(run_hook "$POST" "$REPO/src/lib.rs")
  assert_eq "the order cargo is called in" "fmt clippy" "$(tr '\n' ' ' < "$TEST_TMPDIR/calls" | sed 's/ $//')"
  assert_eq "hookEventName" "PostToolUse" "$(printf '%s' "$out" | jq -r '.hookSpecificOutput.hookEventName')"
}

test_a_clean_clippy_says_nothing() {
  echo "T-006: With no finding it returns nothing"
  # Injecting an empty additionalContext hands the reader nothing.
  local out
  out=$(make_tool_json Edit "$REPO/src/lib.rs" | CARGO_CALLS="$TEST_TMPDIR/calls" CARGO_SILENT=1 PATH="$STUB_BIN:$PATH" "$PRE" 2>/dev/null || true)
  assert_empty "clean clippy" "$out"
}

echo "=== rust_pre_edit.sh / rust_post_edit.sh tests ==="
test_a_non_rust_edit_never_starts_cargo
test_a_rust_file_outside_a_repo_is_skipped
test_the_edited_file_findings_come_first
test_pre_edit_declares_its_event
test_post_edit_formats_then_lints
test_a_clean_clippy_says_nothing

report_results
