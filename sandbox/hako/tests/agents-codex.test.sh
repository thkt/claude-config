#!/usr/bin/env bash
# Unit tests for sandbox/hako/agents.sh's codex row (U-001 of #490: codex as the 2nd agent).
# #489 already covers the claude row (sandbox/hako/tests/agents.test.sh) and the full
# hako.sh -> container -> entrypoint.sh -> init-firewall.sh -> agents.sh chain for claude
# (sandbox/hako/tests/hako-seam.test.sh). This file exercises the same two shapes for
# codex: T-019/T-020 mirror agents.test.sh's table-lookup style directly against agents.sh
# as a subprocess CLI, and T-021 mirrors hako-seam.test.sh's chain style, swapping the
# claude stub for a codex stub so the assertion reads whether codex, not claude, is what
# finally execs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../../hooks/lifecycle/tests/helpers.sh"
AGENTS="$SCRIPT_DIR/../agents.sh"
HAKO="$SCRIPT_DIR/../hako.sh"
ENTRYPOINT="$SCRIPT_DIR/../entrypoint.sh"
AGENT_NAME="codex"

test_codex_resolves_an_exec_command_an_auth_directory_and_an_allowlist() {
  echo "T-019: codex resolves an exec command, an auth directory, and an allowlist"
  # The exact flags on codex's exec command are an implementation choice the contract does
  # not pin (unlike auth-dir, which it names literally), so this only requires the command
  # to actually name the codex CLI rather than pinning a full string.
  assert_contains "exec command names the codex CLI" "codex" "$("$AGENTS" exec codex)"
  assert_eq "auth directory" "/home/node/.codex" "$("$AGENTS" auth-dir codex)"
  assert_contains "allowlist resolves" "github.com" "$("$AGENTS" allowlist codex)"
}

test_the_domain_set_entering_ipset_for_codex_differs_from_the_one_for_claude() {
  echo "T-020: the domain set entering ipset for codex differs from the one for claude"
  local claude_list codex_list
  # Guarded with `|| true`: a plain assignment's command substitution failing (codex is not
  # yet a known agent name) would otherwise trip `set -e` and abort the whole script before
  # any assertion below can report it, the same reason agents.test.sh's own T-002 captures
  # its failing call's status explicitly instead of letting it propagate.
  claude_list="$("$AGENTS" allowlist claude 2>/dev/null)" || true
  codex_list="$("$AGENTS" allowlist codex 2>/dev/null)" || true
  # Checked before the comparison below: a missing codex row leaves codex_list empty, and an
  # empty list "differs from claude's" too, so the divergence assert alone reports a pass on
  # the very state it exists to catch (docs/wiki/zero-hit-positive-control.md).
  assert_contains "codex resolves an allowlist at all" "registry.npmjs.org" "$codex_list"
  # init-firewall.sh (U-002) resolves this exact string into the ipset it builds, so a
  # divergence here is what puts a different domain set into the guest's ipset.
  assert_eq "codex's allowlist differs from claude's" "yes" \
    "$([[ -n "$codex_list" && "$claude_list" != "$codex_list" ]] && echo yes || echo no)"
}

# Template under $TMPDIR: macOS mktemp without a template ignores TMPDIR
TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/agents-codex-tests-XXXXXX")
cleanup() { rm -rf "$TEST_TMPDIR"; }
trap cleanup EXIT

# hako.sh's resolve_workspace_src takes its clone directory from TMPDIR, mirroring
# hako-seam.test.sh's own setup.
export TMPDIR="$TEST_TMPDIR"

STUB_BIN="$TEST_TMPDIR/bin"
mkdir -p "$STUB_BIN"

# Stands in for the host repo hako.sh is invoked from, mirroring hako-seam.test.sh.
FAKE_REPO="$TEST_TMPDIR/fake-repo"
mkdir -p "$FAKE_REPO"

CONTAINER_LOG="$TEST_TMPDIR/container.log"
GOSU_LOG="$TEST_TMPDIR/gosu.log"
IPTABLES_LOG="$TEST_TMPDIR/iptables.log"
CODEX_LOG="$TEST_TMPDIR/codex.log"
RUN_OUT="$TEST_TMPDIR/run.out"

cat > "$STUB_BIN/git" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$STUB_BIN/git"

# container <subcommand> ...: `volume create` is a no-op. `run` relays the trailing
# agent-name argument hako.sh assembled straight into the real entrypoint.sh, standing in
# for the built image's own ENTRYPOINT, mirroring hako-seam.test.sh's own stub.
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

# codex: the leaf of the whole chain. Its log is what confirms the run actually reached
# exec with codex's own command, not claude's.
cat > "$STUB_BIN/codex" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$CODEX_LOG"
exit 0
EOF
chmod +x "$STUB_BIN/codex"

# gosu <user> <command...>: the post-demotion iptables probe must fail, and any other
# command is the agent's own exec, which must actually run. Mirrors hako-seam.test.sh.
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

cat > "$STUB_BIN/ip" <<'EOF'
#!/bin/sh
echo "default via 10.0.0.1 dev eth0 src 10.0.0.5"
exit 0
EOF
chmod +x "$STUB_BIN/ip"

cat > "$STUB_BIN/dig" <<'EOF'
#!/bin/sh
domain=""
for a; do domain="$a"; done
printf '%s. 300 IN A 93.184.216.10\n' "$domain"
EOF
chmod +x "$STUB_BIN/dig"

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

# Runs hako.sh for codex with the stubs first on PATH and $FAKE_REPO standing in for the
# host's $PWD, chaining through the fake container into the real
# entrypoint.sh/init-firewall.sh/agents.sh, mirroring hako-seam.test.sh's run_chain.
run_chain() {
  : > "$CONTAINER_LOG"; : > "$GOSU_LOG"; : > "$IPTABLES_LOG"; : > "$CODEX_LOG"
  (
    cd "$FAKE_REPO"
    export PATH="$STUB_BIN:$PATH"
    export RESOLV_CONF="$GOOD_RESOLV_CONF"
    "$HAKO" "$AGENT_NAME"
  ) >"$RUN_OUT" 2>&1
}

test_the_chain_execs_codex_when_hako_sh_is_given_codex() {
  echo "T-021: the chain execs codex when hako.sh is given codex"
  local status=0
  run_chain || status=$?
  assert_eq "the whole chain exits zero" "0" "$status"

  local run_line last_arg
  run_line="$(grep '^run ' "$CONTAINER_LOG" 2>/dev/null | head -1 || true)"
  last_arg="$(printf '%s' "$run_line" | awk '{print $NF}')"
  assert_eq "the run arguments' trailing positional argument is codex" \
    "$AGENT_NAME" "$last_arg"

  # The codex stub only logs its own argv, not its own command name, so what proves codex
  # (rather than claude, or nothing) actually ran is that its dedicated log file gained a
  # line at all -- STUB_BIN has no claude stub in this chain, so a run that resolved
  # claude's command instead would have logged nothing anywhere.
  assert_eq "codex's own log received an invocation" "yes" \
    "$([[ -s "$CODEX_LOG" ]] && echo yes || echo no)"
}

echo "=== agents.sh codex tests ==="
test_codex_resolves_an_exec_command_an_auth_directory_and_an_allowlist
test_the_domain_set_entering_ipset_for_codex_differs_from_the_one_for_claude
test_the_chain_execs_codex_when_hako_sh_is_given_codex

report_results
