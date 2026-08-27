#!/usr/bin/env bash
# sandbox/hako/hako.sh: host 側 CLI that assembles the `container run` invocation for one
# agent (U-005), plus the `login` subcommand that opens an interactive session for that
# agent's own auth flow (U-006).
#
# Usage: hako.sh <agent-name> [--live]
#        hako.sh login <agent-name>
#
# Workspace source (apple/container docs/command-reference.md `container run` -v/--volume):
#   - default: a throwaway `git clone` of the host repo under $TMPDIR, so the guest never
#     sees the host $PWD and cannot write back into the host tree it was launched from.
#   - --live: the host $PWD itself, for the rare case the agent's changes must land there
#     directly.
# Auth directory: a named volume, `container volume create` (docs/command-reference.md),
# scoped per agent so agent A's credentials are never mounted into agent B's container.
# Both forms take the agent name as their first positional argument (after `login`, for the
# login form) and validate it against agents.sh (U-001) before assembling any run argument.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS="$SCRIPT_DIR/agents.sh"
IMAGE="${HAKO_IMAGE:-hako}"

usage() {
  echo "usage: hako.sh <agent-name> [--live]" >&2
  echo "       hako.sh login <agent-name>" >&2
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

# Shared by run_agent and run_login: resolves the agent's auth volume and issues `container
# run` for it against the given workspace source, with any interactive-mode flags the caller
# prepends. Keeping both callers' -v/--cap-add arguments in one place means a mount change
# only has to be made once.
run_container() {
  local agent_name="$1" workspace_src="$2"
  shift 2
  local auth_dir volume_name
  auth_dir="$("$AGENTS" auth-dir "$agent_name")"
  volume_name="hako-${agent_name}-auth"

  ensure_agent_volume "$volume_name"

  container run \
    "$@" \
    --cap-add NET_ADMIN \
    -v "$workspace_src:/workspace" \
    -v "$volume_name:$auth_dir" \
    "$IMAGE" "$agent_name"
}

# Assembles and runs the ordinary (non-interactive) container invocation for a known agent
# name (U-005).
run_agent() {
  local agent_name="$1" live_flag="${2:-}"
  local workspace_src
  workspace_src="$(resolve_workspace_src "$live_flag")"
  run_container "$agent_name" "$workspace_src"
}

# U-006: `hako.sh login <agent-name>` opens an interactive session so the agent's own login
# flow (browser auth, device code, etc.) can run to completion and persist into the
# per-agent auth volume mounted at auth_dir. The permission-skipping flag lives in
# agents.sh's per-agent exec command, applied inside the container by entrypoint.sh for the
# ordinary run path (U-003); this invocation never reads that field, so it carries no such
# flag.
run_login() {
  local agent_name="$1"
  local workspace_src
  workspace_src="$(resolve_workspace_src "")"
  run_container "$agent_name" "$workspace_src" --interactive --tty
}

main() {
  local first_arg="${1:-}"

  if [[ "$first_arg" == "login" ]]; then
    local agent_name="${2:-}"
    if [[ -z "$agent_name" ]]; then
      usage
      exit 1
    fi
    run_login "$agent_name"
    return
  fi

  if [[ -z "$first_arg" ]]; then
    usage
    exit 1
  fi
  run_agent "$first_arg" "${2:-}"
}

main "$@"
