#!/usr/bin/env bash
# sandbox/hako/agents.sh: single source of truth for the per-agent CLI shape.
#
# One row per agent: name | guest 内の exec コマンド | 認証ディレクトリ | agent 固有の allowlist ドメイン (space 区切り)。
# entrypoint.sh と init-firewall.sh はそれぞれ別プロセスからこの表を読むため、source では
# なくサブコマンド CLI として呼び出す (hooks/lifecycle/failure-alert.sh と同じ形)。
set -euo pipefail

SHARED_ALLOWLIST="github.com api.github.com registry.npmjs.org"

# claude 固有の api.anthropic.com は guest 内の疎通で確定した値。
# codex 固有の chatgpt.com / api.openai.com は openai/codex 公式ドキュメント (model
# sampling/streaming が wss://chatgpt.com、API キー認証が api.openai.com 宛て) の値。
# guest 内の疎通では未確認 (rules/development/SOURCING.md)。
AGENT_TABLE=(
  "claude|claude --dangerously-skip-permissions|/home/node/.claude|api.anthropic.com"
  "codex|codex --dangerously-bypass-approvals-and-sandbox|/home/node/.codex|chatgpt.com api.openai.com"
)

valid_agent_names() {
  local row names=""
  for row in "${AGENT_TABLE[@]}"; do
    local name="${row%%|*}"
    names="${names:+$names,}$name"
  done
  echo "$names"
}

find_row() {
  local name="$1" row
  for row in "${AGENT_TABLE[@]}"; do
    if [[ "${row%%|*}" == "$name" ]]; then
      echo "$row"
      return 0
    fi
  done
  return 1
}

field() {
  local row="$1" index="$2"
  echo "$row" | cut -d'|' -f"$index"
}

main() {
  local subcommand="${1:-}" agent_name="${2:-}" row

  row="$(find_row "$agent_name")" || {
    echo "unknown agent name: $agent_name (valid agent names: $(valid_agent_names))" >&2
    exit 1
  }

  case "$subcommand" in
    exec)
      field "$row" 2
      ;;
    auth-dir)
      field "$row" 3
      ;;
    allowlist)
      echo "$SHARED_ALLOWLIST $(field "$row" 4)"
      ;;
    *)
      echo "unknown subcommand: $subcommand (expected exec|auth-dir|allowlist)" >&2
      exit 1
      ;;
  esac
}

main "$@"
