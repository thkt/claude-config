#!/usr/bin/env bash
# Unit tests for sandbox/hako/init-firewall.sh (U-002: guest 起動時に root が渡された
# allowlist で firewall を適用し、事後検証に通らなければ非 0 で終了する).
#
# Interface this test locks in for the not-yet-written script (agents.sh's own header
# comment says init-firewall.sh reads the agent table from its own process, the same way
# hooks/lifecycle/tests/failure-alert.test.sh drives failure-alert.sh as a subprocess):
#   init-firewall.sh <agent-name>
# and internally it calls "$(dirname "$0")/agents.sh" allowlist "<agent-name>" (a sibling
# CLI call, mirroring how sandbox/hako/tests/agents.test.sh resolves AGENTS), and it reads
# the DNS nameserver from $RESOLV_CONF (defaulting to /etc/resolv.conf) so a test can point
# it at a temp file instead of touching the real one.
#
# All privileged commands (iptables / ipset / ip / dig / curl) are replaced by stubs at the
# front of PATH, mirroring failure-alert.test.sh's afplay stub, so the assertions read what
# the script decided to do rather than touching the real network stack.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../../hooks/lifecycle/tests/helpers.sh"
INIT_FIREWALL="$SCRIPT_DIR/../init-firewall.sh"
AGENTS="$SCRIPT_DIR/../agents.sh"
AGENT_NAME="claude"

# Template under $TMPDIR: macOS mktemp without a template ignores TMPDIR
TEST_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/init-firewall-tests-XXXXXX")
cleanup() { rm -rf "$TEST_TMPDIR"; }
trap cleanup EXIT

STUB_BIN="$TEST_TMPDIR/bin"
mkdir -p "$STUB_BIN"

IPTABLES_LOG="$TEST_TMPDIR/iptables.log"
IPSET_LOG="$TEST_TMPDIR/ipset.log"
: > "$IPTABLES_LOG"
: > "$IPSET_LOG"

cat > "$STUB_BIN/iptables" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$IPTABLES_LOG"
exit 0
EOF
chmod +x "$STUB_BIN/iptables"

cat > "$STUB_BIN/ipset" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$IPSET_LOG"
exit 0
EOF
chmod +x "$STUB_BIN/ipset"

# A fixed default-route line: no test scenario here pins the gateway value itself, only
# that the script keeps running once it has read one.
cat > "$STUB_BIN/ip" <<'EOF'
#!/bin/sh
echo "default via 10.0.0.1 dev eth0 src 10.0.0.5"
exit 0
EOF
chmod +x "$STUB_BIN/ip"

# dig resolves any domain to a fake IP, except the domain named in DIG_FAIL_DOMAIN, which
# resolves to nothing -- an allowed domain the DNS server cannot reach (T-005).
cat > "$STUB_BIN/dig" <<'EOF'
#!/bin/sh
domain=""
for a; do domain="$a"; done
if [ -n "${DIG_FAIL_DOMAIN:-}" ] && [ "$domain" = "$DIG_FAIL_DOMAIN" ]; then
  exit 0
fi
printf '%s. 300 IN A 93.184.216.10\n' "$domain"
EOF
chmod +x "$STUB_BIN/dig"

# curl simulates the post-check: a probe against the blocked domain (example.com) fails by
# default (connection refused, exit 7) and a probe against an allowed domain succeeds
# (exit 0). CURL_BLOCKED_REACHABLE=1 flips the blocked probe to succeed, simulating a
# firewall that let a non-allowed domain through (T-006).
cat > "$STUB_BIN/curl" <<'EOF'
#!/bin/sh
url=""
for a; do
  case "$a" in
    http*) url="$a" ;;
  esac
done
case "$url" in
  *example.com*)
    [ "${CURL_BLOCKED_REACHABLE:-0}" = "1" ] && exit 0
    exit 7
    ;;
  *)
    exit 0
    ;;
esac
EOF
chmod +x "$STUB_BIN/curl"

# A resolv.conf under the tmp dir, never the real /etc/resolv.conf.
GOOD_RESOLV_CONF="$TEST_TMPDIR/resolv.conf"
printf 'nameserver 10.9.9.9\n' > "$GOOD_RESOLV_CONF"

run_firewall() {
  # Runs init-firewall.sh with the stub PATH and the good-path env; the caller's `||`
  # captures the exit status. Callers export overrides (DIG_FAIL_DOMAIN,
  # CURL_BLOCKED_REACHABLE, RESOLV_CONF) as a prefix before calling.
  (
    export PATH="$STUB_BIN:$PATH"
    export RESOLV_CONF="${RESOLV_CONF:-$GOOD_RESOLV_CONF}"
    "$INIT_FIREWALL" "$AGENT_NAME"
  ) >"$TEST_TMPDIR/run.out" 2>&1
}

test_the_udp_53_rule_is_generated_from_the_nameserver_in_resolv_conf_and_no_reference_to_127_0_0_11_remains() {
  echo "T-004: the udp/53 rule is generated from the nameserver in resolv.conf and no reference to 127.0.0.11 remains"
  : > "$IPTABLES_LOG"
  RESOLV_CONF="$GOOD_RESOLV_CONF" run_firewall || true
  assert_contains "udp/53 rule names the resolv.conf nameserver" \
    "10.9.9.9" "$(grep -i 'udp' "$IPTABLES_LOG" 2>/dev/null || true)"
  assert_empty "no 127.0.0.11 reference remains in the script" \
    "$(grep -o '127\.0\.0\.11' "$INIT_FIREWALL" 2>/dev/null || true)"
}

test_a_failed_dns_resolution_of_an_allowed_domain_exits_non_zero() {
  echo "T-005: a failed DNS resolution of an allowed domain exits non-zero"
  local status=0
  # api.anthropic.com is claude's own allowlist domain per agents.sh (U-001).
  DIG_FAIL_DOMAIN="api.anthropic.com" run_firewall || status=$?
  assert_eq "exit code is non-zero" "yes" "$([[ "$status" -ne 0 ]] && echo yes || echo no)"
  # Pins the failure to the unresolved domain itself, not to an unrelated crash: a bare
  # non-zero exit is also what a missing/broken script produces.
  assert_contains "failure names the domain that failed to resolve" \
    "api.anthropic.com" "$(cat "$TEST_TMPDIR/run.out" 2>/dev/null || true)"
}

test_reaching_a_blocked_domain_in_the_post_check_exits_non_zero() {
  echo "T-006: reaching a blocked domain in the post-check exits non-zero"
  local status=0
  CURL_BLOCKED_REACHABLE=1 run_firewall || status=$?
  assert_eq "exit code is non-zero" "yes" "$([[ "$status" -ne 0 ]] && echo yes || echo no)"
  # Pins the failure to the blocked-domain probe itself, not to an unrelated crash.
  assert_contains "failure names the domain the post-check reached" \
    "example.com" "$(cat "$TEST_TMPDIR/run.out" 2>/dev/null || true)"
}

test_the_domain_set_entering_ipset_comes_from_the_agents_table_rather_than_a_constant_in_the_script() {
  echo "T-007: the domain set entering ipset comes from the agents table rather than a constant in the script"
  local marker_dir="$TEST_TMPDIR/marker-sandbox"
  mkdir -p "$marker_dir"
  cp "$INIT_FIREWALL" "$marker_dir/init-firewall.sh" 2>/dev/null || true
  cp "$AGENTS" "$marker_dir/agents.sh" 2>/dev/null || true
  chmod +x "$marker_dir/init-firewall.sh" "$marker_dir/agents.sh" 2>/dev/null || true
  # Replaces claude's allowlist domain with one that exists nowhere else, so an ipset entry
  # for it can only have come from reading this copy's table at run time, not from a value
  # baked into init-firewall.sh itself.
  sed -i.bak 's/api\.anthropic\.com/marker-domain-t007.example/' "$marker_dir/agents.sh" 2>/dev/null || true

  : > "$IPSET_LOG"
  (
    export PATH="$STUB_BIN:$PATH"
    export RESOLV_CONF="$GOOD_RESOLV_CONF"
    "$marker_dir/init-firewall.sh" "$AGENT_NAME"
  ) >"$TEST_TMPDIR/marker-run.out" 2>&1 || true

  assert_contains "ipset receives the marker domain from the copied agents table" \
    "marker-domain-t007.example" "$(cat "$IPSET_LOG" 2>/dev/null || true)"
}

echo "=== init-firewall.sh tests ==="
test_the_udp_53_rule_is_generated_from_the_nameserver_in_resolv_conf_and_no_reference_to_127_0_0_11_remains
test_a_failed_dns_resolution_of_an_allowed_domain_exits_non_zero
test_reaching_a_blocked_domain_in_the_post_check_exits_non_zero
test_the_domain_set_entering_ipset_comes_from_the_agents_table_rather_than_a_constant_in_the_script

report_results
