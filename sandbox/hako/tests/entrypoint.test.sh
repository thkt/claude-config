#!/usr/bin/env bash
# Unit tests for sandbox/hako/entrypoint.sh (U-003: 降格して agent を exec する).
#
# Interface this test locks in for the not-yet-written script (mirroring how
# sandbox/hako/tests/init-firewall.test.sh locks in init-firewall.sh's interface before it
# existed):
#   entrypoint.sh <agent-name>
# Internally it runs "$(dirname "$0")/init-firewall.sh" "<agent-name>" as root (a sibling
# CLI call), and on success demotes via gosu to the node user and execs the agent's exec
# command read from "$(dirname "$0")/agents.sh" exec "<agent-name>" (a second sibling call,
# the same shape sandbox/hako/tests/init-firewall.test.sh already pins for init-firewall.sh
# reading agents.sh).
#
# gosu and iptables are replaced by stubs at the front of PATH, mirroring
# init-firewall.test.sh's own iptables/ipset/dig/curl stubs, so the assertions read what the
# script decided to do rather than touching real privileges or the network stack.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../../hooks/lifecycle/tests/helpers.sh"
ENTRYPOINT="$SCRIPT_DIR/../entrypoint.sh"
AGENTS="$SCRIPT_DIR/../agents.sh"
AGENT_NAME="claude"

# Template under $TMPDIR: macOS mktemp without a template ignores TMPDIR
TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/entrypoint-tests-XXXXXX")
cleanup() { rm -rf "$TEST_TMPDIR"; }
trap cleanup EXIT

STUB_BIN="$TEST_TMPDIR/bin"
mkdir -p "$STUB_BIN"

GOSU_LOG="$TEST_TMPDIR/gosu.log"
: > "$GOSU_LOG"

# gosu <user> <command...>. Logs every invocation. When the demoted command is iptables (the
# entrypoint's own post-demotion safety probe), the exit code is controlled by
# GOSU_IPTABLES_EXIT (default 1: the demoted user cannot run iptables, the safe case). Any
# other command (the agent exec itself) just logs and exits 0, standing in for the agent
# process succeeding.
cat > "$STUB_BIN/gosu" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$GOSU_LOG"
cmd="\$2"
if [ "\$cmd" = "iptables" ]; then
  exit "\${GOSU_IPTABLES_EXIT:-1}"
fi
exit 0
EOF
chmod +x "$STUB_BIN/gosu"

# A bare iptables call (not through gosu) should never happen inside entrypoint.sh itself --
# only init-firewall.sh (stubbed out per-scenario below) touches it directly as root.
cat > "$STUB_BIN/iptables" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$STUB_BIN/iptables"

# Builds an isolated copy of the sandbox dir so each scenario can swap in its own fake
# init-firewall.sh / agents.sh without mutating the scripts under test. $1: exit code the
# fake init-firewall.sh returns. $2 (optional): a sed expression applied to the copied
# agents.sh, for T-010's marker substitution.
make_sandbox_copy() {
  local firewall_exit="$1" agents_sed="${2:-}"
  local dir="$TEST_TMPDIR/sandbox-$RANDOM"
  mkdir -p "$dir"
  cp "$ENTRYPOINT" "$dir/entrypoint.sh"
  cp "$AGENTS" "$dir/agents.sh"
  chmod +x "$dir/entrypoint.sh" "$dir/agents.sh"
  if [[ -n "$agents_sed" ]]; then
    sed -i.bak "$agents_sed" "$dir/agents.sh"
  fi
  cat > "$dir/init-firewall.sh" <<EOF
#!/bin/sh
exit $firewall_exit
EOF
  chmod +x "$dir/init-firewall.sh"
  echo "$dir"
}

run_entrypoint() {
  local dir="$1"
  (
    export PATH="$STUB_BIN:$PATH"
    "$dir/entrypoint.sh" "$AGENT_NAME"
  ) >"$TEST_TMPDIR/run.out" 2>&1
}

test_the_entrypoint_does_not_exec_the_agent_and_exits_non_zero_when_the_firewall_script_fails() {
  echo "T-008: the entrypoint does not exec the agent and exits non-zero when the firewall script fails"
  local dir status=0
  dir="$(make_sandbox_copy 1)"
  : > "$GOSU_LOG"
  run_entrypoint "$dir" || status=$?
  assert_eq "exit code is non-zero" "yes" "$([[ "$status" -ne 0 ]] && echo yes || echo no)"
  # Pins the failure to the firewall script itself, not to an unrelated crash: a bare
  # non-zero exit is also what a missing/broken entrypoint.sh produces.
  assert_contains "run output reports the firewall failure" \
    "firewall" "$(cat "$TEST_TMPDIR/run.out" 2>/dev/null || true)"
  assert_empty "gosu (and therefore the agent exec) is never invoked" "$(cat "$GOSU_LOG")"
}

test_the_entrypoint_aborts_when_an_iptables_operation_succeeds_as_the_demoted_user() {
  echo "T-009: the entrypoint aborts when an iptables operation succeeds as the demoted user"
  local dir status=0
  dir="$(make_sandbox_copy 0)"
  : > "$GOSU_LOG"
  GOSU_IPTABLES_EXIT=0 run_entrypoint "$dir" || status=$?
  assert_eq "exit code is non-zero" "yes" "$([[ "$status" -ne 0 ]] && echo yes || echo no)"
  assert_contains "gosu was probed with iptables as the demoted user" \
    "iptables" "$(cat "$GOSU_LOG")"
  assert_empty "the agent's own exec command never ran" \
    "$(grep -v 'iptables' "$GOSU_LOG" 2>/dev/null || true)"
}

test_the_exec_d_command_comes_from_the_agents_table_rather_than_a_name_written_into_the_entrypoint() {
  echo "T-010: the exec'd command comes from the agents table rather than a name written into the entrypoint"
  assert_empty "no agent exec command is hardcoded in entrypoint.sh" \
    "$(grep -oE 'claude --dangerously-skip-permissions' "$ENTRYPOINT" 2>/dev/null || true)"

  local dir status=0
  dir="$(make_sandbox_copy 0 's/claude --dangerously-skip-permissions/marker-cmd-t010/')"
  : > "$GOSU_LOG"
  run_entrypoint "$dir" || status=$?
  assert_eq "exit code is zero" "0" "$status"
  assert_contains "the exec'd command is the copied agents table's marker, not a literal in entrypoint.sh" \
    "marker-cmd-t010" "$(cat "$GOSU_LOG")"
}

echo "=== entrypoint.sh tests ==="
test_the_entrypoint_does_not_exec_the_agent_and_exits_non_zero_when_the_firewall_script_fails
test_the_entrypoint_aborts_when_an_iptables_operation_succeeds_as_the_demoted_user
test_the_exec_d_command_comes_from_the_agents_table_rather_than_a_name_written_into_the_entrypoint

report_results
