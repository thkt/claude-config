---
paths:
  - ".claude/skills/**"
  - "skills/**"
  - ".ja/skills/**"
---

# Skill Conventions

Conventions for skill files under `skills/`.

## Naming

Name a skill after the operation it performs. Replace generic names like helper, utils, tools with the operation name.

| user-invocable | Binding    | Pattern               | Examples                                      |
| -------------- | ---------- | --------------------- | --------------------------------------------- |
| true           | -          | Short name            | commit, fix, audit                            |
| false          | CLI wrap   | `use-cli-<cli>`       | use-cli-recall, use-cli-scout                 |
| false          | Agent-only | `use-context-<agent>` | use-context-reviewer-security                 |
| false          | Workflow   | `use-workflow-<noun>` | use-workflow-tdd-cycle, use-workflow-pageshot |

## H1

The H1 tells a reader which kind of skill they opened: one a person types, or a wrapper only the model reaches.

| user-invocable | H1                            | Example                              |
| -------------- | ----------------------------- | ------------------------------------ |
| true (default) | Opens with `/<name>`          | `# /issue - GitHub Issue Generation` |
| false          | The skill's own name          | `# use-cli-scout`                    |

## Directory structure

All skills live directly under `skills/`, and shared fragments under `_lib/`.

```text
skills/
├── _lib/
└── skill-name/
    ├── SKILL.md (required)
    └── references/ (optional)
        └── detailed-guide.md
```

## YAML Frontmatter

| Field                    | Notes                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- |
| name                     | Required. Lowercase + hyphens, ≤64 chars                                         |
| description              | Required. Third person, ≤1024 chars                                              |
| when_to_use              | EN/JP trigger phrases                                                            |
| allowed-tools            | Space-separated                                                                  |
| agent                    | Links to an agent under `agents/`                                                |
| context                  | fork = sub-agent, inline = main                                                  |
| user-invocable           | Default true. false hides it from the / menu                                     |
| disable-model-invocation | true stops model-side invocation, leaving only the / route                       |
| model                    | Model override for execution (e.g. opus). Inherits the invoking model when unset |
| argument-hint            | Argument hint shown in the / menu (e.g. `"[decision title]"`)                    |

## Reference notation

Write reference paths inside SKILL.md, scripts/, templates/, references/ with bare `${CLAUDE_SKILL_DIR}` substitution.

| Form                                          | Use         | Reason                                                                                                                    |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `${CLAUDE_SKILL_DIR}/references/foo.md`       | Always      | Harness expands the variable to absolute path. Read tool resolves directly                                                |
| `${CLAUDE_SKILL_DIR}/../<dir>/foo.md`         | Cross-skill | Harness expands the variable; Read normalizes the .. segment. Used for shared \_lib/ across skills                        |
| `${CLAUDE_SKILL_DIR}/../../rules/<path>`      | Rules       | Harness expands it and it resolves inside the plugin install, so the skill reads the rules that shipped with it           |
| `~/.claude/rules/<path>`                      | Never       | Names the dev tree. A plugin install reads another copy, or none. `~/.claude/settings.json` is the running side and stays |
| `[references/foo.md](references/foo.md)`      | Never       | Harness does not expand markdown links; AI infers relative path                                                           |
| `` `${CLAUDE_SKILL_DIR}/references/foo.md` `` | Avoid       | Harness behavior inside backticks is undocumented; safer to omit                                                          |

## Argument variables

Skill input arguments expand at invocation time.

| Variable        | Returns                       | Example (args=`alpha beta gamma`) |
| --------------- | ----------------------------- | --------------------------------- |
| `$ARGUMENTS`    | full argument string          | `alpha beta gamma`                |
| `$ARGUMENTS[N]` | `split(' ')[N]` (0-indexed)   | `[0]`=`alpha`, `[1]`=`beta`       |
| `$N`            | shorthand for `$ARGUMENTS[N]` | `$0`=`alpha`, `$1`=`beta`         |

## Size limits

- A SKILL.md body and a reference file both cap at 100 lines
- Over the cap, a SKILL.md body splits into reference files and a reference file splits by topic

## Craft

A skill can satisfy every mechanical rule and still read poorly.

| Axis                        | Pass condition                                                           | Fail signal                                                        |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Single responsibility       | One task per skill. A second unrelated trigger is a split signal         | description joins 2+ unrelated capabilities                        |
| Description distinctiveness | Sentence 1 enumerates the capability with concrete verbs and objects     | Generic verbs like helps with or manages that fit many skills      |
| Imperative voice            | Body commands the agent directly                                         | Passive recital of what the skill does                             |
| Verifiable completion       | Steps end with checkable conditions and an explicit stop point           | Done-state absent, or a confirmation order with no check condition |
| Concrete calibration        | A Good / Bad pair, Yes / Not contrast, or numeric threshold per judgment | Rules stated abstractly with no example                            |
| Progressive disclosure      | SKILL.md stays thin; detail moves to references/                         | Inline dumps that belong in references/                            |
