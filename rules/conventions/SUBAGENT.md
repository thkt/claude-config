---
paths:
  - ".claude/agents/**"
  - "agents/**"
  - ".ja/agents/**"
---

# Subagent Conventions

Conventions for subagent files under `agents/`.

## Naming

The only naming pattern is lowercase + hyphens, `<role>-<scope>`. Files live in the plural-role subdirectory.

| Role prefix | Purpose                      | Example           |
| ----------- | ---------------------------- | ----------------- |
| critic-     | Challenge                    | critic-design     |
| enhancer-   | Code improvement + synthesis | enhancer-code     |
| explorer-   | Codebase exploration         | explorer-feature  |
| generator-  | Artifact generation          | generator-test    |
| resolver-   | Error resolution             | resolver-build    |
| reviewer-   | Inspection                   | reviewer-security |

## YAML Frontmatter

Subagents are spawned via the Agent tool, not auto-loaded. AskUserQuestion / EnterPlanMode / ScheduleWakeup and similar tools do not work inside subagents, even when listed in `tools`. The Agent tool itself does work inside a subagent, and subagents nest up to depth 3 counting the main loop as depth 0.

| Field                           | Notes                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| name                            | Required. Lowercase + hyphens. Need not match the filename. Unique per scope (on duplicate, one is discarded without warning)                                                  |
| description                     | Required. States when to delegate. Used for delegation routing                                                                                                                 |
| tools, disallowedTools          | Comma- or space-separated string. Omitting inherits all tools. Bash matcher syntax (`Bash(git log:*)`) supported                                                               |
| model                           | sonnet / opus / haiku / fable / inherit / full-id. Defaults to `inherit`                                                                                                       |
| permissionMode, maxTurns        | As needed                                                                                                                                                                      |
| skills                          | Injects skill contents at spawn time. Plugin form: `<plugin>:<skill>`                                                                                                          |
| mcpServers, hooks               | As needed                                                                                                                                                                      |
| memory                          | `user` / `project` / `local`. Enabling auto-grants Read / Write / Edit                                                                                                         |
| background                      | Boolean. An interactive-session spawn runs in the background even when this is set to `false`. Workflow and headless paths fall outside that default                           |
| effort                          | low / medium / high / xhigh / max                                                                                                                                              |
| isolation, color, initialPrompt | As needed                                                                                                                                                                      |
| observer                        | Agent type auto-spawned as a background observer whenever this agent runs. The observer takes read-only activity digests, reports via ObserverReport, and never joins the task |
| observerMessage                 | Supplemental postamble appended to each activity digest sent to the observer. Blank values are ignored                                                                         |
| observeSubagents                | Boolean. Extends the observer's watch to nested subagents                                                                                                                      |

## Fork decision

`subagent_type` takes exactly one value. `"fork"` and an `agents/` type name are mutually exclusive, so choosing fork loads no agent definition. A fork is a copy of yourself, not a different agent. critic- and reviewer- agents exist to attack the parent's conclusion, so forking one dissolves the role.

| Spawn                                    | Fork | Reason                                                                                                                              |
| ---------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Names an `agents/` type                  | No   | The model choice, tool limits, independence, and return shape all disappear at once                                                 |
| Omits the type or passes a built-in type | Yes  | When the parent conversation is the subject itself, it saves copying context into the prompt. Input tokens grow by the conversation |

## Choosing model and memory

Grant memory when all three below hold, and remove it when the project scope stays empty of real data afterward.

- Spawned repeatedly across sessions (called on every audit)
- Output quality depends on project-specific knowledge (naming conventions, allowed patterns)
- It reduces false positives or improves consistency (stops re-reporting known exceptions)

| What the model needs                                          | Recommended  |
| ------------------------------------------------------------- | ------------ |
| Multi-step instructions, agent-to-agent DM, shutdown protocol | opus, sonnet |
| Mechanical single-pass output                                 | haiku        |
| Matching the parent context                                   | inherit      |

## Body structure

| Section                | Purpose                           |
| ---------------------- | --------------------------------- |
| Input                  | The task prompt the agent expects |
| Constraints / PROHIBIT | What the agent must not do        |
| Workflow / Phases      | Step-by-step actions              |
| Output                 | DM payload or file artifact       |
| Error Handling         | Recovery behavior                 |

## Finding severity

reviewer- agents follow the Severity (critical / high / medium / low) in `~/.claude/agents/_lib/finding-schema.md`. What to fix first is the Disposition in the same file, which is where the values are listed. An agent returning its own gate verdict (critic- agents with confirmed / disputed) follows its own scheme.

## Reference notation

Where a relative path resolves depends on the launching project.

| Form                                         | Use                       | Reason                                                              |
| -------------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `skills: [skill-name]` frontmatter           | Reusing skill content     | As preload control, the full text is injected into context at spawn |
| `~/.claude/skills/<skill>/references/foo.md` | Lazy-loading a supplement | Resolves with Read regardless of cwd                                |
| `skills/<skill>/references/foo.md`           | Avoid                     | Resolves only when cwd is `~/.claude`                               |
| `${CLAUDE_SKILL_DIR}`                        | Not available             | Skill-body-only variable                                            |

## Size limit

- An agent body and a shared fragment under `_lib/` both cap at 100 lines
- Over the cap, an agent body moves detail into `_lib/` and a `_lib/` file splits by topic
