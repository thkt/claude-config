# Security Model

## Permission Evaluation Flow Is UX, Not Security

The Claude Code permission evaluation flow (PreToolUse Hook → Deny Rules → Allow Rules → Ask Rules → Permission Mode) filters tool_use blocks. It is not a security boundary.

An LLM is a text generator and tool_use is one output format. Once Bash is allowed, OS capabilities pass through as-is. What actually constrains those capabilities is the process sandbox, not the permission rules.

ref: <https://zenn.dev/commander/articles/72a907ce68a8c1>

## Defense Layers

shields (command guard, file ACL, secrets check) belongs to the same binary family but is not wired into `settings.json`, so it does not count as a layer (see Dormant in [HOOKS](./HOOKS.md)).

Important: L1 and L2 tune human intervention points (UX). L3 is the actual security boundary.

| Layer               | Implementation                                        | What It Stops                  | Bypass via Bash |
| ------------------- | ----------------------------------------------------- | ------------------------------ | --------------- |
| L1: Deny Rules      | `settings.json` `permissions.deny` (43 rules)         | Per tool_use block             | Yes             |
| L2: PreToolUse Hook | 3 hooks in `hooks/security/` + 3 in `hooks/pre-bash/` | Dangerous patterns inside Bash | Partial         |
| L3: Process Sandbox | sandbox-runtime (`settings.json` `sandbox`)           | Filesystem writes and network  | No              |

### Current L3 Configuration

| Key                            | Value                                                 |
| ------------------------------ | ----------------------------------------------------- |
| `enabled`                      | true                                                  |
| `failIfUnavailable`            | true. Claude Code exits when the sandbox cannot start |
| `filesystem.allowWrite`        | `~/.Trash`, `~/.claude/.git`, `~/.claude/workflows`   |
| `enableWeakerNetworkIsolation` | true                                                  |
| `excludedCommands`             | afplay, scout                                         |

## Known Gaps

| Gap                                        | Risk                                         | Mitigation                                                                |
| ------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------- |
| `excludedCommands` run outside the sandbox | scout reaches the network directly           | Keep the list at two commands; review any addition as an exfil path       |
| `enableWeakerNetworkIsolation` is true     | Opens an exfiltration path through trustd    | Required for `gh` TLS verification; without it build fails at issue fetch |
| External transmission via allowed tools    | Data exfiltration possible via scout, gh api | Indistinguishable from legitimate use, handle operationally               |
| npm/pnpm install postinstall               | Arbitrary code execution                     | `npm_install_guard.py` blocks installs without ignore-scripts             |

## Team Guidelines

| Guideline                                     | Description                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| deny ≠ safe                                   | Adding deny rules alone does not equal a complete security response                    |
| Allowing Bash = OS capability delegation      | Once Bash is allowed, deny rules can be bypassed. L3 imposes the actual limit          |
| hook = probabilistic defense                  | `hooks/security/` is pattern matching. It cannot cover unknown paths                   |
| bypassPermissions = isolated environment only | Do not use in production or development environments                                   |
| Keep secrets outside the environment          | `.env` and credentials are covered by `permissions.deny` Read rules and sandbox reads  |
| Leaving the sandbox is an explicit call       | `dangerouslyDisableSandbox` and `excludedCommands` drop L3. State the reason each time |

## When to Use Containers

Cases needing isolation beyond L3.

- Running agents automatically in CI/CD
- Running agents on untrusted repositories
- Network must be fully cut off, including the `excludedCommands` route
- Compliance requirements demand process isolation

For local development with human supervision, L1 to L3 are sufficient.
