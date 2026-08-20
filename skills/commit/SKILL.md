---
name: commit
description: Analyze Git diff, generate a Conventional Commits format message, and run the commit.
when_to_use: コミットして, コミット作成, commit changes
allowed-tools: Bash(git:*) Bash(cat:*)
model: haiku
argument-hint: "[context or issue reference]"
---

# /commit - Git Commit Execution

## Input

`$ARGUMENTS` may contain context or an issue reference. Trim whitespace; if empty, analyze staged changes only. If non-empty, treat it as a hint for the message scope or footer.

## Execution

1. Run `git status` and `git diff --staged` in parallel to read the staged changes
2. Generate one message from the changes and `$ARGUMENTS` (§ Type Detection, § Rules)
3. Run the commit directly via the sandbox-compatible commit

## Type Detection

Infer type from diff context. When it cannot be told, use chore. feat declares a semver minor bump, so do not pick it without grounds.

| Type     | When to use                                |
| -------- | ------------------------------------------ |
| feat     | New functionality or capability            |
| fix      | Bug fix or error correction                |
| refactor | Code restructuring without behavior change |
| docs     | Documentation only changes                 |
| test     | Adding or updating tests                   |
| chore    | Config, dependencies, maintenance          |
| perf     | Performance optimization                   |
| style    | Formatting, whitespace, linting            |
| ci       | CI/CD configuration changes                |

## Rules

Assemble the message as `<type>(<scope>): <subject>`. A breaking change takes a `!` after the type, as in `feat(api)!:`. The table below decides the rule for each part.

| Part    | Rule                                                                             |
| ------- | -------------------------------------------------------------------------------- |
| Subject | 72 chars or fewer. Imperative, lowercase, no trailing period                     |
| Body    | The why the diff cannot show, such as motivation or rationale. Omit when obvious |
| Footer  | `BREAKING CHANGE:`, `Closes #123`, `Co-authored-by:`                             |

## Sandbox-Compatible Commit

Confirm the target repository with the leading `git rev-parse --show-toplevel`.

```bash
git rev-parse --show-toplevel
cat > "$TMPDIR/commit-msg.txt" << 'EOF'
<message>
EOF
git commit -F "$TMPDIR/commit-msg.txt"
```

## Error Handling

| Error                              | Treatment                                                              |
| ---------------------------------- | ---------------------------------------------------------------------- |
| No staged files                    | Do not commit; report that the stage is empty                          |
| Empty diff                         | Commit with a minimal message                                          |
| No git repository                  | Do not commit; report that this is not a git repo                      |
| Repository is not the one intended | Do not commit; report the `git rev-parse --show-toplevel` output       |
| Pre-commit failed                  | Report the hook output as it stands. The user decides whether to retry |
