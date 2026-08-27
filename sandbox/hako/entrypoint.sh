#!/usr/bin/env bash
# sandbox/hako/entrypoint.sh: apply the firewall as root, demote to the unprivileged node
# user, and exec the agent's command (U-003).
#
# Runs as root inside the guest container. Order matters for the security guarantee:
#   1. Apply the firewall (init-firewall.sh, U-002) while still root; a non-zero exit means
#      the guest network is not locked down, so the agent must never run.
#   2. Probe, via gosu, that the demoted node user cannot run iptables. Node has neither
#      NET_ADMIN nor sudo, so the probe should fail; if it instead succeeds, demotion did
#      not shed the privilege it claims to, so abort rather than exec the agent under it.
#   3. exec the agent's command (read from agents.sh, U-001; never hardcoded here) as node.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS="$SCRIPT_DIR/agents.sh"
DEMOTED_USER="node"

AGENT_NAME="${1:-}"
if [[ -z "$AGENT_NAME" ]]; then
  echo "ERROR: usage: entrypoint.sh <agent-name>" >&2
  exit 1
fi

if ! "$SCRIPT_DIR/init-firewall.sh" "$AGENT_NAME"; then
  echo "ERROR: firewall setup failed, refusing to exec $AGENT_NAME" >&2
  exit 1
fi

# Post-demotion safety probe: $DEMOTED_USER must not be able to run iptables. Its success
# would mean NET_ADMIN (or root) survived the demotion, so abort instead of exec-ing the
# agent under it.
if gosu "$DEMOTED_USER" iptables -L INPUT -n >/dev/null 2>&1; then
  echo "ERROR: $DEMOTED_USER can still run iptables after demotion, aborting" >&2
  exit 1
fi

AGENT_EXEC="$("$AGENTS" exec "$AGENT_NAME")"
# Unquoted on purpose: agents.sh returns a single space-separated command line (e.g. "claude
# --dangerously-skip-permissions") that gosu/exec need split back into argv, the same way
# init-firewall.sh iterates its own space-separated ALLOWLIST unquoted.
exec gosu "$DEMOTED_USER" $AGENT_EXEC
