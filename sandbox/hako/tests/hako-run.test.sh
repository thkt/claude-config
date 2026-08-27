#!/usr/bin/env bash
# Unit tests for sandbox/hako/hako.sh (U-005: host 側 hako <agent> が使い捨て clone を
# workspace として mount する container run 引数を組む).
#
# Interface this test locks in for the not-yet-written script (mirroring how
# sandbox/hako/tests/entrypoint.test.sh locked in entrypoint.sh's interface before it
# existed):
#   hako.sh <agent-name> [--live]
# Internally it is expected to call, as sibling processes on PATH (apple/container
# docs/command-reference.md):
#   container volume create <per-agent-volume-name>   -- once per agent, idempotent
#   container run --cap-add NET_ADMIN -v <workspace-src>:/workspace \
#     -v <per-agent-volume-name>:<auth-dir> ... <image> <agent-name>
# where <workspace-src> is a throwaway `git clone` of the repo by default, and $PWD itself
# only when --live is given. U-006 adds the login subcommand and full agent-name
# validation; this unit only locks in the run-argument assembly for a known-good agent name.
#
# container and git are replaced by stubs at the front of PATH, mirroring
# entrypoint.test.sh's gosu/iptables stubs, so the assertions read what hako.sh decided to
# invoke rather than touching a real VM or the real repo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../../hooks/lifecycle/tests/helpers.sh"
HAKO="$SCRIPT_DIR/../hako.sh"
AGENT_NAME="claude"

# Template under $TMPDIR: macOS mktemp without a template ignores TMPDIR
TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/hako-run-tests-XXXXXX")
cleanup() { rm -rf "$TEST_TMPDIR"; }
trap cleanup EXIT

STUB_BIN="$TEST_TMPDIR/bin"
mkdir -p "$STUB_BIN"

# Stands in for the host repo hako.sh is invoked from: a real directory so $PWD resolves to
# something concrete, without needing a real .git history (git itself is stubbed below).
FAKE_REPO="$TEST_TMPDIR/fake-repo"
mkdir -p "$FAKE_REPO"

CONTAINER_LOG="$TEST_TMPDIR/container.log"
GIT_LOG="$TEST_TMPDIR/git.log"

# Logs every `container <subcommand> ...` invocation as one line, so a scenario can grep for
# the `run` line or the `volume create` line independently.
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
# on PATH. $1: agent name. $2 (optional): an extra flag such as --live.
run_hako() {
  local agent="$1" extra_flag="${2:-}"
  : > "$CONTAINER_LOG"
  : > "$GIT_LOG"
  (
    cd "$FAKE_REPO"
    export PATH="$STUB_BIN:$PATH"
    if [[ -n "$extra_flag" ]]; then
      "$HAKO" "$agent" "$extra_flag"
    else
      "$HAKO" "$agent"
    fi
  ) >"$TEST_TMPDIR/run.out" 2>&1
}

test_the_default_run_mounts_a_temporary_clone_of_the_repo_and_no_mount_argument_carries_pwd() {
  echo "T-011: the default run mounts a temporary clone of the repo and no mount argument carries \$PWD"
  run_hako "$AGENT_NAME" || true
  local run_line
  run_line="$(grep '^run ' "$CONTAINER_LOG" 2>/dev/null | head -1 || true)"
  assert_empty "no run argument contains the host \$PWD" \
    "$(printf '%s' "$run_line" | grep -F "$FAKE_REPO" 2>/dev/null || true)"
  assert_contains "the run mounts a workspace target" "/workspace" "$run_line"
  assert_contains "a throwaway git clone produced the mounted workspace" \
    "clone" "$(cat "$GIT_LOG" 2>/dev/null || true)"
}

test_only_live_mounts_pwd_as_the_workspace() {
  echo "T-012: only --live mounts \$PWD as the workspace"
  run_hako "$AGENT_NAME" "--live" || true
  local run_line
  run_line="$(grep '^run ' "$CONTAINER_LOG" 2>/dev/null | head -1 || true)"
  assert_contains "the run mounts the host \$PWD as the workspace" "$FAKE_REPO" "$run_line"
  assert_empty "no throwaway clone is made under --live" "$(cat "$GIT_LOG" 2>/dev/null || true)"
}

test_the_generated_run_arguments_carry_cap_add_net_admin_and_the_per_agent_named_volume_mount() {
  echo "T-013: the generated run arguments carry --cap-add NET_ADMIN and the per-agent named volume mount"
  run_hako "$AGENT_NAME" || true
  local volume_create_line volume_name run_line
  volume_create_line="$(grep '^volume create' "$CONTAINER_LOG" 2>/dev/null | head -1 || true)"
  assert_contains "a named volume was created" "volume create" "$volume_create_line"
  volume_name="$(printf '%s' "$volume_create_line" | awk '{print $3}' 2>/dev/null || true)"
  assert_contains "the volume name is scoped to this agent" "$AGENT_NAME" "$volume_name"

  run_line="$(grep '^run ' "$CONTAINER_LOG" 2>/dev/null | head -1 || true)"
  # Pattern omits the leading "--": BSD grep (macOS, used by assert_contains) parses a
  # pattern argument starting with "--" as an unrecognized long option instead of literal text.
  assert_contains "run carries the cap-add flag" "cap-add" "$run_line"
  assert_contains "run adds the NET_ADMIN capability" "NET_ADMIN" "$run_line"
  assert_contains "run mounts the same per-agent volume volume-create made" "$volume_name" "$run_line"
}

echo "=== hako.sh run-argument tests ==="
test_the_default_run_mounts_a_temporary_clone_of_the_repo_and_no_mount_argument_carries_pwd
test_only_live_mounts_pwd_as_the_workspace
test_the_generated_run_arguments_carry_cap_add_net_admin_and_the_per_agent_named_volume_mount

report_results
