---
name: checkout
description: Analyze Git changes and create a new branch with an appropriate name.
when_to_use: ブランチ作成, ブランチ切って, ブランチ名, branch name
allowed-tools: Bash(git:*)
model: haiku
argument-hint: "[context or ticket number]"
---

# /checkout - Git Branch Creation

The manual counterpart of build's Branch stage. Both assemble the name by the same rules.

## Input

`$ARGUMENTS` may contain context or a ticket number. Trim whitespace; if empty, analyze the Git changes alone. If non-empty, treat it as a hint for the branch name scope or ticket ID.

## Execution

1. Run `git status` and `git diff HEAD` in parallel to read the changes. Plain `git diff` hides staged changes
2. Settle on one branch name from the changes and `$ARGUMENTS` (§ Branch Naming)
3. Create the new branch via `git checkout -b <the settled name>`

## Branch Naming

Assemble the name and read the type per ${CLAUDE_SKILL_DIR}/references/branch-naming.md. build's Branch phase reads the same rules.

## Error Handling

| Error             | Treatment                                                  |
| ----------------- | ---------------------------------------------------------- |
| No changes        | Do not create a branch; report that there are no changes   |
| Branch exists     | Settle on another name and create that instead             |
| No git repository | Do not create a branch; report that this is not a git repo |
