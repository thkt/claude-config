---
paths:
  - ".claude/skills/**"
  - "skills/**"
  - ".ja/skills/**"
---

# Skill Conventions

Conventions for skill files under `skills/`.

## Naming

Choose by category. Generic names like helper, utils, tools are not allowed.

| user-invocable | Binding    | Pattern               | Examples                                      |
| -------------- | ---------- | --------------------- | --------------------------------------------- |
| true           | -          | Short name            | commit, fix, audit                            |
| false          | CLI wrap   | `use-cli-<cli>`       | use-cli-recall, use-cli-scout                 |
| false          | Agent-only | `use-context-<agent>` | use-context-reviewer-security                 |
| false          | Workflow   | `use-workflow-<noun>` | use-workflow-tdd-cycle, use-workflow-pageshot |

## Directory structure

All skills live directly under skills/. Claude reads SKILL.md first, references only when needed. Shared fragments live directly under \_lib/.

```text
skills/
├── _lib/
└── skill-name/
    ├── SKILL.md (required)
    └── references/ (optional)
        └── detailed-guide.md
```

## YAML Frontmatter

| Field          | Required | Notes                                                                            |
| -------------- | -------- | -------------------------------------------------------------------------------- |
| name           | Yes      | Lowercase + hyphens, ≤64 chars                                                   |
| description    | Yes      | Third person, ≤1024 chars                                                        |
| when_to_use    | No       | EN/JP trigger phrases                                                            |
| allowed-tools  | No       | Space-separated                                                                  |
| agent          | No       | Links to an agent under `agents/`                                                |
| context        | No       | fork = sub-agent, inline = main                                                  |
| user-invocable | No       | Default true. false hides from the / menu (internal skills)                      |
| model          | No       | Model override for execution (e.g. opus). Inherits the invoking model when unset |
| argument-hint  | No       | Argument hint shown in the / menu (e.g. `"[decision title]"`)                    |

## Reference notation

Write reference paths inside SKILL.md, scripts/, templates/, references/ with bare `${CLAUDE_SKILL_DIR}` substitution.

| Form                                          | Use         | Reason                                                                                             |
| --------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `${CLAUDE_SKILL_DIR}/references/foo.md`       | Always      | Harness expands the variable to absolute path. Read tool resolves directly                         |
| `${CLAUDE_SKILL_DIR}/../<dir>/foo.md`         | Cross-skill | Harness expands the variable; Read normalizes the .. segment. Used for shared \_lib/ across skills |
| `[references/foo.md](references/foo.md)`      | Never       | Harness does not expand markdown links; AI infers relative path                                    |
| `` `${CLAUDE_SKILL_DIR}/references/foo.md` `` | Avoid       | Harness behavior inside backticks is undocumented; safer to omit                                   |

## Argument variables

Skill input arguments expand at invocation time. Use `$ARGUMENTS` to capture multi-word free text and `$ARGUMENTS[0]` to get the first word explicitly.

| Variable        | Returns                       | Example (args=`alpha beta gamma`) |
| --------------- | ----------------------------- | --------------------------------- |
| `$ARGUMENTS`    | full argument string          | `alpha beta gamma`                |
| `$ARGUMENTS[N]` | `split(' ')[N]` (0-indexed)   | `[0]`=`alpha`, `[1]`=`beta`       |
| `$N`            | shorthand for `$ARGUMENTS[N]` | `$0`=`alpha`, `$1`=`beta`         |

## Size limits

| Rule            | Threshold | Action                      |
| --------------- | --------- | --------------------------- |
| SKILL.md body   | 200 lines | Split into reference files  |
| Reference files | 200 lines | Consider splitting by topic |

## Craft

Quality axes beyond the frontmatter and size rules above. A skill can satisfy every mechanical rule and still read poorly.

| Axis                        | Pass condition                                                           | Fail signal                                                        |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Single responsibility       | One task per skill. A second unrelated trigger is a split signal         | description joins 2+ unrelated capabilities                        |
| Description distinctiveness | Sentence 1 enumerates the capability with concrete verbs and objects     | Generic verbs like helps with or manages that fit many skills      |
| Imperative voice            | Body commands the agent directly                                         | Passive recital of what the skill does                             |
| Verifiable completion       | Steps end with checkable conditions and an explicit stop point           | Done-state absent, or a confirmation order with no check condition |
| Concrete calibration        | A Good / Bad pair, Yes / Not contrast, or numeric threshold per judgment | Rules stated abstractly with no example                            |
| Progressive disclosure      | SKILL.md stays thin; detail moves to references/                         | Inline dumps that belong in references/                            |
