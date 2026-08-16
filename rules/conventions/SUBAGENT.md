---
paths:
  - ".claude/agents/**"
  - "agents/**"
  - ".ja/agents/**"
---

# Subagent Conventions

Conventions for sub-agent files under `agents/`.

## Naming

The naming pattern is lowercase + hyphens `<role>-<scope>` only. Files live in plural role subdirectories.

| Role prefix | Purpose                       | Example           |
| ----------- | ----------------------------- | ----------------- |
| critic-     | Adversarial challenge         | critic-design     |
| enhancer-   | Code refinement and synthesis | enhancer-code     |
| explorer-   | Codebase mapping              | explorer-feature  |
| generator-  | Artifact creation             | generator-test    |
| resolver-   | Error fixing                  | resolver-build    |
| reviewer-   | Inspection                    | reviewer-security |

## YAML Frontmatter

Subagents are spawned via the Agent tool, not auto-loaded. AskUserQuestion / EnterPlanMode / ScheduleWakeup and similar tools do not work inside subagents, even when listed in `tools`. The Agent tool itself does work inside a subagent, and subagents nest up to depth 3 counting the main loop as depth 0.

| Field                           | Required | Notes                                                                                                                                                |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| name                            | Yes      | Lowercase + hyphens. Need not match the filename. Unique per scope (on duplicate, one is discarded without warning)                                  |
| description                     | Yes      | States when to delegate. Used for delegation routing                                                                                                 |
| tools, disallowedTools          | No       | Comma- or space-separated string. Omitting inherits all tools. Bash matcher syntax (`Bash(git log:*)`) supported                                     |
| model                           | No       | sonnet / opus / haiku / fable / inherit / full-id. Defaults to `inherit`                                                                             |
| permissionMode, maxTurns        | No       | As needed                                                                                                                                            |
| skills                          | No       | Injects skill contents at spawn time. Plugin form: `<plugin>:<skill>`                                                                                |
| mcpServers, hooks               | No       | As needed                                                                                                                                            |
| memory                          | No       | `user` / `project` / `local`. Enabling auto-grants Read / Write / Edit                                                                               |
| background                      | No       | Boolean. An interactive-session spawn runs in the background even when this is set to `false`. Workflow and headless paths fall outside that default |
| effort                          | No       | low / medium / high / xhigh / max                                                                                                                    |
| isolation, color, initialPrompt | No       | As needed                                                                                                                                            |

## Fork decision

`subagent_type` takes exactly one value. `"fork"` and an `agents/` type name are mutually exclusive, so choosing fork loads no agent definition. A fork is a copy of yourself, not a different agent. critic- and reviewer- agents exist to attack the parent's conclusion, so forking one dissolves the role.

The decision turns on whether the spawn names an `agents/` type.

| Spawn                                     | Fork       | Reason                                                                                                                                  |
| ----------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Names an `agents/` type                   | Unsuitable | model choice, tools restriction, independence, and return shape are discarded together                                                  |
| Omits the type, or passes a built-in type | Allowed    | Saves rewriting the context into the prompt when the parent conversation is itself the subject. Input tokens grow with the conversation |

## Model selection

| Need                                                | Recommended  |
| --------------------------------------------------- | ------------ |
| Multi-step instructions, peer DM, shutdown protocol | opus, sonnet |
| Mechanical single-pass output                       | haiku        |
| Match parent context                                | inherit      |

## Memory selection criteria

The required conditions for granting memory are below. After assignment, remove memory from agents whose project scope stays empty.

| Required condition | Description                                            | Example                              |
| ------------------ | ------------------------------------------------------ | ------------------------------------ |
| Frequency          | Invoked repeatedly across sessions                     | Called on every audit                |
| Project-dependent  | Output quality depends on project-specific knowledge   | Naming conventions, allowed patterns |
| Learning benefit   | Memory reduces false positives or improves consistency | Stop re-reporting known exceptions   |

## Body structure

| Section                | Purpose                              |
| ---------------------- | ------------------------------------ |
| Input                  | Task prompt fields the agent expects |
| Constraints / PROHIBIT | What the agent must not do           |
| Workflow / Phases      | Step-by-step actions                 |
| Output                 | DM payload or file artifacts         |
| Error Handling         | Recovery behavior                    |

## Finding severity

A reviewer- agent follows the Severity field (critical / high / medium / low) in `~/.claude/agents/_lib/finding-schema.md`. Agents returning their own gate verdict (critic- confirmed / disputed, etc.) use their own scheme.

## Reference notation

Relative path resolution depends on the launching project.

| Form                                         | Use                                 | Reason                                                          |
| -------------------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `skills: [skill-name]` frontmatter           | Reusing skill content               | Preload control: full content is injected into context at spawn |
| `~/.claude/skills/<skill>/references/foo.md` | Lazy-loading supplementary material | Resolves via Read regardless of cwd                             |
| `skills/<skill>/references/foo.md`           | Avoid                               | Resolves only when cwd is `~/.claude`                           |
| `${CLAUDE_SKILL_DIR}`                        | Not available                       | Skill-body-only variable                                        |

## Size limit

The body threshold is 200 lines.
