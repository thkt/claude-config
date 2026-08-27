#!/usr/bin/env bash
# sandbox/hako/hako.sh: host 側 CLI that assembles the `container run` invocation for one
# agent (U-005).
#
# Usage: hako.sh <agent-name> [--live]
#
# Workspace source (apple/container docs/command-reference.md `container run` -v/--volume):
#   - default: a throwaway `git clone` of the host repo under $TMPDIR, so the guest never
#     sees the host $PWD and cannot write back into the host tree it was launched from.
#   - --live: the host $PWD itself, for the rare case the agent's changes must land there
#     directly.
# Auth directory: a named volume, `container volume create` (docs/command-reference.md),
# scoped per agent so agent A's credentials are never mounted into agent B's container.
# U-006 adds the login subcommand and full agent-name validation; this unit only assembles
# the run arguments for an already-known-good agent name.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS="$SCRIPT_DIR/agents.sh"
IMAGE="${HAKO_IMAGE:-hako}"

usage() {
  echo "usage: hako.sh <agent-name> [--live]" >&2
}

# Resolves the directory mounted at /workspace. --live uses the host $PWD as-is; otherwise
# clones $PWD into a throwaway directory under $TMPDIR and returns that clone's path.
resolve_workspace_src() {
  local live_flag="$1"
  if [[ "$live_flag" == "--live" ]]; then
    echo "$PWD"
    return
  fi
  local clone_dir
  clone_dir="$(mktemp -d "${TMPDIR:-/tmp}/hako-clone-XXXXXX")"
  git clone "$PWD" "$clone_dir" >/dev/null
  echo "$clone_dir"
}

# Creates this agent's named volume if it does not already exist. `container volume create`
# on an existing name errors, so a rerun for the same agent must not treat that as fatal.
ensure_agent_volume() {
  local volume_name="$1"
  container volume create "$volume_name" >/dev/null 2>&1 || true
}

main() {
  local agent_name="${1:-}" live_flag="${2:-}"
  if [[ -z "$agent_name" ]]; then
    usage
    exit 1
  fi

  local auth_dir volume_name workspace_src
  auth_dir="$("$AGENTS" auth-dir "$agent_name")"
  volume_name="hako-${agent_name}-auth"
  workspace_src="$(resolve_workspace_src "$live_flag")"

  ensure_agent_volume "$volume_name"

  container run \
    --cap-add NET_ADMIN \
    -v "$workspace_src:/workspace" \
    -v "$volume_name:$auth_dir" \
    "$IMAGE" "$agent_name"
}

main "$@"
