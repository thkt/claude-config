---
name: checkout
description: Analyze Git changes and create a new branch with an appropriate name.
when_to_use: ブランチ作成, ブランチ切って, ブランチ名, branch name
allowed-tools: Bash(git:*) AskUserQuestion
model: haiku
argument-hint: "[context or ticket number]"
---

# /checkout - Git Branch Creation

## Input

`$ARGUMENTS` may contain context or a ticket number. Trim whitespace; if empty, analyze the Git changes alone. If non-empty, treat it as a hint for the branch name scope or ticket ID.

## Execution

1. Run `git status` and `git diff HEAD` in parallel to read the changes. Plain `git diff` hides staged changes
2. Generate 3 branch name candidates that follow the naming convention from the changes and `$ARGUMENTS`
3. Present each candidate with a selection reason via `AskUserQuestion` and let the user pick one
4. Create the new branch via `git checkout -b <selected name>`

## Branch Naming

Determine the type from the changes and assemble the branch name in this format. Each type's trigger is in the table below.

```text
<type>/<scope>-<description>
<type>/<ticket>-<description>
```

| Prefix    | Purpose              | Trigger               |
| --------- | -------------------- | --------------------- |
| feat/     | New functionality    | New files, components |
| fix/      | Bug fixes            | Error corrections     |
| refactor/ | Code improvements    | Restructuring         |
| docs/     | Documentation        | .md files, README     |
| test/     | Test additions/fixes | Test files            |
| chore/    | Maintenance          | Dependencies, config  |
| perf/     | Performance          | Optimization, caching |

- Compose it from lowercase and hyphen separators; do not use spaces, underscores, or CamelCase
- Keep scope and description to 2-4 words, naming the target and the result rather than a vague word such as update
- If `$ARGUMENTS` has a ticket ID, include it at the `<ticket>` position. Names this skill creates carry no date

## Error Handling

| Error             | Action                      |
| ----------------- | --------------------------- |
| No changes        | Report there are no changes |
| Branch exists     | Suggest an alternative name |
| No git repository | Report it is not a git repo |

## Output

Report the created branch name on a single line.
