#!/usr/bin/env bash
# Unit tests for sandbox/hako/hako.sh (U-006: hako のサブコマンドと agent 名検証).
#
# Interface this test locks in for hako.sh's not-yet-written login subcommand and
# name-validation hardening (mirroring how sandbox/hako/tests/hako-run.test.sh locked in
# hako.sh's run-argument assembly before it existed):
#   hako.sh login <agent-name>
# validates <agent-name> the same way the plain `hako.sh <agent-name>` form does (against
# agents.sh, U-001), and only then assembles the `container run` invocation -- in interactive
# mode (apple/container docs/command-reference.md `-i/--interactive`, `-t/--tty`), carrying
# none of the permission-skipping flag agents.sh bakes into the ordinary run's exec command.
#
# container and git are replaced by stubs at the front of PATH, mirroring
# hako-run.test.sh's own stubs, so the assertions read what hako.sh decided to invoke rather
# than touching a real VM or the real repo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../../hooks/lifecycle/tests/helpers.sh"
HAKO="$SCRIPT_DIR/../hako.sh"
AGENT_NAME="claude"

# Template under $TMPDIR: macOS mktemp without a template ignores TMPDIR
TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/hako-cli-tests-XXXXXX")
cleanup() { rm -rf "$TEST_TMPDIR"; }
trap cleanup EXIT

# hako.sh's resolve_workspace_src takes its clone directory from TMPDIR. Pointed inside
# TEST_TMPDIR so the trap above carries the clones away; left at the outer value, every
# scenario strands one full clone beside it.
export TMPDIR="$TEST_TMPDIR"

STUB_BIN="$TEST_TMPDIR/bin"
mkdir -p "$STUB_BIN"

# Stands in for the host repo hako.sh is invoked from: a real directory so $PWD resolves to
# something concrete, without needing a real .git history (git itself is stubbed below).
FAKE_REPO="$TEST_TMPDIR/fake-repo"
mkdir -p "$FAKE_REPO"

CONTAINER_LOG="$TEST_TMPDIR/container.log"
GIT_LOG="$TEST_TMPDIR/git.log"

# Logs every `container <subcommand> ...` invocation as one line, so a scenario can grep for
# the `run` line or confirm none was made.
cat > "$STUB_BIN/container" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$CONTAINER_LOG"
exit 0
EOF
chmod +x "$STUB_BIN/container"

# Logs every git invocation; never touches a real remote or the real repo.
cat > "$STUB_BIN/git" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$GIT_LOG"
exit 0
EOF
chmod +x "$STUB_BIN/git"

# Runs hako.sh with $FAKE_REPO as cwd (standing in for the host's $PWD) and the stubs first
# on PATH. Args are passed through verbatim, so a scenario can cover any combination of
# subcommand and agent name, including omitting the agent name entirely.
run_hako() {
  : > "$CONTAINER_LOG"
  : > "$GIT_LOG"
  (
    cd "$FAKE_REPO"
    export PATH="$STUB_BIN:$PATH"
    "$HAKO" "$@"
  ) >"$TEST_TMPDIR/run.out" 2>&1
}

test_the_login_subcommand_starts_in_interactive_mode_and_passes_no_permission_skipping_flag() {
  echo "T-014: the login subcommand starts in interactive mode and passes no permission-skipping flag"
  run_hako login "$AGENT_NAME" || true
  local run_line
  run_line="$(grep '^run ' "$CONTAINER_LOG" 2>/dev/null | head -1 || true)"
  assert_contains "login opens stdin" "interactive" "$run_line"
  assert_contains "login opens a tty" "tty" "$run_line"
  # BSD grep parses a pattern starting with "--" as an option, not literal text (see
  # hako-run.test.sh), so the checked substring omits the leading dashes.
  assert_empty "login carries no permission-skipping flag" \
    "$(printf '%s' "$run_line" | grep -F "dangerously-skip-permissions" 2>/dev/null || true)"
}

test_an_omitted_or_unknown_agent_name_exits_non_zero_without_calling_container_run() {
  echo "T-015: an omitted or unknown agent name exits non-zero without calling container run"
  local status

  status=0
  run_hako || status=$?
  assert_eq "no args: exit code is non-zero" "yes" "$([[ "$status" -ne 0 ]] && echo yes || echo no)"
  assert_empty "no args: container run was never called" "$(grep '^run ' "$CONTAINER_LOG" 2>/dev/null || true)"

  status=0
  run_hako "bogus-agent" || status=$?
  assert_eq "unknown agent: exit code is non-zero" "yes" "$([[ "$status" -ne 0 ]] && echo yes || echo no)"
  assert_empty "unknown agent: container run was never called" "$(grep '^run ' "$CONTAINER_LOG" 2>/dev/null || true)"
  assert_empty "unknown agent: no throwaway clone was left behind" "$(cat "$GIT_LOG" 2>/dev/null || true)"

  status=0
  run_hako login || status=$?
  assert_eq "login, agent omitted: exit code is non-zero" "yes" "$([[ "$status" -ne 0 ]] && echo yes || echo no)"
  assert_empty "login, agent omitted: container run was never called" "$(grep '^run ' "$CONTAINER_LOG" 2>/dev/null || true)"

  status=0
  run_hako login "bogus-agent" || status=$?
  assert_eq "login, unknown agent: exit code is non-zero" "yes" "$([[ "$status" -ne 0 ]] && echo yes || echo no)"
  assert_empty "login, unknown agent: container run was never called" "$(grep '^run ' "$CONTAINER_LOG" 2>/dev/null || true)"
  assert_empty "login, unknown agent: no throwaway clone was left behind" "$(cat "$GIT_LOG" 2>/dev/null || true)"
}

echo "=== hako.sh CLI subcommand and validation tests ==="
test_the_login_subcommand_starts_in_interactive_mode_and_passes_no_permission_skipping_flag
test_an_omitted_or_unknown_agent_name_exits_non_zero_without_calling_container_run

report_results
