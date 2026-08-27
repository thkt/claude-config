#!/usr/bin/env bash
# Seam tests for U-007: the chain hako.sh -> (container) -> entrypoint.sh -> init-firewall.sh
# -> agents.sh, run as the real, unmodified scripts. Each of those scripts already has its
# own unit test (agents.test.sh, init-firewall.test.sh, entrypoint.test.sh, hako-run.test.sh
# / hako-cli.test.sh) that stubs everything past its own boundary. This file asserts the
# boundaries those tests could not see across on their own:
#   - the agent-name argument hako.sh assembles into `container run ...` is the same one
#     entrypoint.sh reads (T-016)
#   - entrypoint.sh only demotes and execs after init-firewall.sh's real exit code is zero,
#     and never does either when it is not (T-016, T-017)
#   - the exec command that finally runs is the one agents.sh's own table resolves for the
#     agent, not a value fixed anywhere else (T-016)
#
# What is fake here is the union of what init-firewall.test.sh and entrypoint.test.sh already
# fake for the same external-command reasons, plus the two named in this unit's contract
# (container, claude):
#   - container: Apple's `container` CLI is macOS-only and does not exist on Linux CI; the
#     stub relays the trailing agent-name argument straight into the real entrypoint.sh,
#     standing in for what launching the built image (whose ENTRYPOINT is entrypoint.sh)
#     would do.
#   - claude: the real @anthropic-ai CLI, replaced so this suite never depends on a live
#     account or network call to Anthropic.
#   - iptables / ipset: root+Linux only, exactly as init-firewall.test.sh already fakes them.
#   - ip / dig / curl: init-firewall.test.sh already fakes exactly these three -- ip is
#     Linux-only and absent on a macOS dev machine, and a no-op iptables/ipset stub cannot
#     make a real network probe come back genuinely blocked, so dig/curl's answers have to
#     be simulated the same way init-firewall.test.sh already simulates them.
#   - gosu: privilege drop to a real "node" OS user, which exists only inside the
#     Dockerfile-built image (U-004), never on the host that runs this suite. gosu's actual
#     privilege-drop behavior is already covered by entrypoint.test.sh; this stub only lets
#     the chain's control flow (did the agent's own exec command actually get reached?)
#     complete on a bare host.
# T-017 forces the firewall failure through RESOLV_CONF naming a file with no nameserver
# line -- a real init-firewall.sh code path -- rather than a forced-failure flag on a stub.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../../hooks/lifecycle/tests/helpers.sh"
HAKO="$SCRIPT_DIR/../hako.sh"
ENTRYPOINT="$SCRIPT_DIR/../entrypoint.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
WORKFLOW="$REPO_ROOT/.github/workflows/test.yml"
AGENT_NAME="claude"

# Template under $TMPDIR: macOS mktemp without a template ignores TMPDIR
TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/hako-seam-tests-XXXXXX")
cleanup() { rm -rf "$TEST_TMPDIR"; }
trap cleanup EXIT

STUB_BIN="$TEST_TMPDIR/bin"
mkdir -p "$STUB_BIN"

# Stands in for the host repo hako.sh is invoked from, mirroring hako-run.test.sh.
FAKE_REPO="$TEST_TMPDIR/fake-repo"
mkdir -p "$FAKE_REPO"

CONTAINER_LOG="$TEST_TMPDIR/container.log"
GOSU_LOG="$TEST_TMPDIR/gosu.log"
IPTABLES_LOG="$TEST_TMPDIR/iptables.log"
CLAUDE_LOG="$TEST_TMPDIR/claude.log"
RUN_OUT="$TEST_TMPDIR/run.out"

# git: hako.sh's default (non---live) path clones $PWD into a throwaway dir; a no-op keeps
# the chain moving without touching a real remote, mirroring hako-run.test.sh's own stub.
cat > "$STUB_BIN/git" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$STUB_BIN/git"

# container <subcommand> ...: `volume create` is a no-op (mirrors hako-run.test.sh). `run`
# relays this unit's boundary (a) -- the trailing agent-name argument hako.sh assembled --
# straight into the real entrypoint.sh, standing in for the built image's own ENTRYPOINT.
cat > "$STUB_BIN/container" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$CONTAINER_LOG"
if [ "\$1" != "run" ]; then
  exit 0
fi
agent=""
for a; do agent="\$a"; done
exec "$ENTRYPOINT" "\$agent"
EOF
chmod +x "$STUB_BIN/container"

# claude: the leaf of the whole chain. Its log is what confirms the run actually reached
# exec with the command agents.sh names for claude, not just that no earlier step errored.
cat > "$STUB_BIN/claude" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$CLAUDE_LOG"
exit 0
EOF
chmod +x "$STUB_BIN/claude"

# gosu <user> <command...>: the post-demotion iptables probe must fail (no real NET_ADMIN
# survives demotion on a host with no real "node" user either), and any other command is
# the agent's own exec, which must actually run. Mirrors entrypoint.test.sh's own stub.
cat > "$STUB_BIN/gosu" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$GOSU_LOG"
shift
cmd="\$1"
if [ "\$cmd" = "iptables" ]; then
  exit 1
fi
exec "\$@"
EOF
chmod +x "$STUB_BIN/gosu"

# iptables / ipset: root+Linux only, same reason and shape as init-firewall.test.sh's own
# stubs.
cat > "$STUB_BIN/iptables" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$IPTABLES_LOG"
exit 0
EOF
chmod +x "$STUB_BIN/iptables"

cat > "$STUB_BIN/ipset" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$STUB_BIN/ipset"

# ip: Linux-only (see init-firewall.test.sh's own header comment); a fixed default-route
# line, since no scenario here pins the gateway value itself.
cat > "$STUB_BIN/ip" <<'EOF'
#!/bin/sh
echo "default via 10.0.0.1 dev eth0 src 10.0.0.5"
exit 0
EOF
chmod +x "$STUB_BIN/ip"

# dig: resolves anything to a fake IP, the same shape as init-firewall.test.sh's own stub.
cat > "$STUB_BIN/dig" <<'EOF'
#!/bin/sh
domain=""
for a; do domain="$a"; done
printf '%s. 300 IN A 93.184.216.10\n' "$domain"
EOF
chmod +x "$STUB_BIN/dig"

# curl: simulates the post-check's expected reachability outcome -- a no-op iptables/ipset
# stub cannot make a real probe come back genuinely blocked, so the blocked/allowed answer
# has to be simulated, the same shape as init-firewall.test.sh's own stub.
cat > "$STUB_BIN/curl" <<'EOF'
#!/bin/sh
url=""
for a; do
  case "$a" in
    http*) url="$a" ;;
  esac
done
case "$url" in
  *example.com*) exit 7 ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$STUB_BIN/curl"

GOOD_RESOLV_CONF="$TEST_TMPDIR/resolv.conf.good"
printf 'nameserver 10.9.9.9\n' > "$GOOD_RESOLV_CONF"
# No "nameserver" line: init-firewall.sh's own real NAMESERVER check fails on this, a real
# script code path rather than a forced-failure flag on a stub.
BAD_RESOLV_CONF="$TEST_TMPDIR/resolv.conf.bad"
: > "$BAD_RESOLV_CONF"

# Runs hako.sh for $AGENT_NAME with the stubs first on PATH and $FAKE_REPO standing in for
# the host's $PWD, chaining through the fake container into the real
# entrypoint.sh/init-firewall.sh/agents.sh. $1: the RESOLV_CONF handed to that chain.
run_chain() {
  local resolv_conf="$1"
  : > "$CONTAINER_LOG"; : > "$GOSU_LOG"; : > "$IPTABLES_LOG"; : > "$CLAUDE_LOG"
  (
    cd "$FAKE_REPO"
    export PATH="$STUB_BIN:$PATH"
    export RESOLV_CONF="$resolv_conf"
    "$HAKO" "$AGENT_NAME"
  ) >"$RUN_OUT" 2>&1
}

test_hako_sh_claudes_run_arguments_drive_the_entrypoint_to_exec_claude_as_the_demoted_user_after_the_firewall_applies() {
  echo "T-016: hako.sh claude's run arguments drive the entrypoint to exec claude as the demoted user after the firewall applies"
  local status=0
  run_chain "$GOOD_RESOLV_CONF" || status=$?
  assert_eq "the whole chain exits zero" "0" "$status"

  local run_line last_arg
  run_line="$(grep '^run ' "$CONTAINER_LOG" 2>/dev/null | head -1 || true)"
  last_arg="$(printf '%s' "$run_line" | awk '{print $NF}')"
  assert_eq "the run arguments' trailing positional argument is the agent name" \
    "$AGENT_NAME" "$last_arg"

  assert_contains "the real init-firewall.sh actually applied rules (not skipped)" \
    "ACCEPT" "$(cat "$IPTABLES_LOG" 2>/dev/null || true)"

  local exec_line
  exec_line="$(grep -v iptables "$GOSU_LOG" 2>/dev/null | head -1 || true)"
  assert_eq "entrypoint demotes to node and execs claude's own command from agents.sh" \
    "node claude --dangerously-skip-permissions" "$exec_line"

  assert_contains "claude actually ran, carrying the flag agents.sh resolved for it" \
    "dangerously-skip-permissions" "$(cat "$CLAUDE_LOG" 2>/dev/null || true)"
}

test_a_non_zero_exit_from_init_firewall_sh_leaves_the_agent_unexeced_and_ends_the_whole_chain_non_zero() {
  echo "T-017: a non-zero exit from init-firewall.sh leaves the agent unexec'd and ends the whole chain non-zero"
  local status=0
  run_chain "$BAD_RESOLV_CONF" || status=$?
  assert_eq "the whole chain exits non-zero" "yes" "$([[ "$status" -ne 0 ]] && echo yes || echo no)"
  # Pins the failure to the firewall, not to an unrelated crash: a bare non-zero exit is
  # also what a missing/broken script produces.
  assert_contains "the failure is attributed to the firewall" \
    "firewall" "$(cat "$RUN_OUT" 2>/dev/null || true)"
  assert_empty "no demotion is ever attempted" "$(cat "$GOSU_LOG" 2>/dev/null || true)"
  assert_empty "claude never runs" "$(cat "$CLAUDE_LOG" 2>/dev/null || true)"
}

test_the_ci_shell_tests_step_discovers_every_test_file_under_sandbox() {
  echo "T-018: the CI Shell tests step discovers every test file under sandbox"
  local shell_step find_cmd discovered
  shell_step="$(awk '/name: Shell tests/{flag=1; next} /- name:/{if (flag) exit} flag' "$WORKFLOW")"
  find_cmd="$(printf '%s' "$shell_step" | grep -oE 'find [^|]+' | head -1)"
  assert_contains "the Shell tests step still runs a find command" "find" "$find_cmd"

  discovered="$(cd "$REPO_ROOT" && eval "$find_cmd" 2>/dev/null)"
  assert_contains "the find target discovers this seam test file under sandbox" \
    "sandbox/hako/tests/hako-seam.test.sh" "$discovered"
}

echo "=== hako seam tests ==="
test_hako_sh_claudes_run_arguments_drive_the_entrypoint_to_exec_claude_as_the_demoted_user_after_the_firewall_applies
test_a_non_zero_exit_from_init_firewall_sh_leaves_the_agent_unexeced_and_ends_the_whole_chain_non_zero
test_the_ci_shell_tests_step_discovers_every_test_file_under_sandbox

report_results
