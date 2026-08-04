# Security Model

## Permission Evaluation Flow Is UX, Not Security

The Claude Code permission evaluation flow (PreToolUse Hook → Deny Rules → Allow Rules → Ask Rules → Permission Mode) filters tool_use blocks. It is not a security boundary.

An LLM is a text generator and tool_use is one output format. Once Bash is allowed, OS capabilities pass through as-is.

ref: <https://zenn.dev/commander/articles/72a907ce68a8c1>

## Defense Layers

| Layer                 | Implementation         | What It Stops                  | Bypass via Bash |
| --------------------- | ---------------------- | ------------------------------ | --------------- |
| L1: Deny Rules        | settings.json deny     | Per tool_use block             | Yes             |
| L2: PreToolUse Hook   | shields check          | Dangerous patterns inside Bash | Partial         |
| L3: PermissionRequest | shields acl            | Subagent config modification   | N/A             |
| L4: macOS Seatbelt    | Built into Claude Code | Partial filesystem restriction | OS-enforced     |
| L5: Process Sandbox   | Not implemented        | Network and full FS            | No              |

Important: L1 to L3 tune human intervention points (UX). L4 to L5 are the actual security boundary.

## Known Gaps

| Gap                                       | Risk                                            | Mitigation                                                  |
| ----------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Network calls from allowed Bash commands  | Data exfiltration possible via curl/wget        | Block file upload patterns via shields check                |
| External transmission via allowed tools   | Data exfiltration possible via scout, gh api    | Indistinguishable from legitimate use, handle operationally |
| npm/pnpm install postinstall              | Arbitrary code execution                        | Use only trusted packages                                   |
| L5 process sandbox not implemented        | Cannot restrict agent communication at OS level | Consider containerization (future)                          |

## Team Guidelines

| Guideline                                     | Description                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| deny ≠ safe                                   | Adding deny rules alone does not equal a complete security response                                |
| Allowing Bash = OS capability delegation      | Once Bash is allowed, deny rules can be bypassed                                                   |
| hook = probabilistic defense                  | shields check is pattern matching. It cannot cover unknown paths                                   |
| bypassPermissions = isolated environment only | Do not use in production or development environments                                               |
| Keep secrets outside the environment          | .env and credentials are double-protected by deny + hook, but no process-level restriction applies |
| Subagent permissions                          | shields acl denies modifications to security files. Bash routes still depend on L2                 |

## When to Use Containers

Cases where L5 is required.

- Running agents automatically in CI/CD
- Running agents on untrusted repositories
- External communication must be prohibited for the agent
- Compliance requirements demand process isolation

For local development with human supervision, L1 to L4 are sufficient.
