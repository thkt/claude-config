---
paths:
  - ".claude/agents/**"
---

# Subagent Conventions

Conventions for sub-agent files under `.claude/agents/`.

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

Subagents are spawned via the Task tool, not auto-loaded. AskUserQuestion / EnterPlanMode / ScheduleWakeup and similar tools do not work inside subagents, even when listed in `tools`. In contrast, Agent does work, and subagents nest up to depth 3 counting the main loop as depth 0.

| Field                           | Required | Notes                                                                                                               |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| name                            | Yes      | Lowercase + hyphens. Need not match the filename. Unique per scope (on duplicate, one is discarded without warning) |
| description                     | Yes      | States when to delegate. Used for delegation routing                                                                |
| tools, disallowedTools          | No       | Comma- or space-separated string. Omitting inherits all tools. Bash matcher syntax (`Bash(git log:*)`) supported    |
| model                           | No       | sonnet / opus / haiku / fable / inherit / full-id. Defaults to `inherit`                                            |
| permissionMode, maxTurns        | No       | As needed                                                                                                           |
| skills                          | No       | Injects skill contents at spawn time. Plugin form: `<plugin>:<skill>`                                               |
| mcpServers, hooks               | No       | As needed                                                                                                           |
| memory                          | No       | `user` / `project` / `local`. Enabling auto-grants Read / Write / Edit                                              |
| background                      | No       | Boolean. Defaults to `false`                                                                                        |
| effort                          | No       | low / medium / high / xhigh / max                                                                                   |
| isolation, color, initialPrompt | No       | As needed                                                                                                           |

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

When a reviewer- agent lists advisory findings, tag each with one of the labels below so the consumer (/audit or the user) separates must-fix from preference. Unlabeled findings mix Critical with Nit, and the nit flood buries the must-fix items.

Agents returning their own gate verdict (critic- confirmed / disputed, etc.) use their own scheme and do not layer this label on top.

| Label    | Meaning                                                       |
| -------- | ------------------------------------------------------------- |
| Critical | Correctness / safety / behavior breaks unless fixed. Blocking |
| Nit      | Good to fix but optional. Style or minor readability          |
| Optional | A suggestion. The implementer decides, fine to skip           |

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
