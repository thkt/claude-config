---
name: commit
description: Analyze Git diff, generate a Conventional Commits format message, and run the commit.
when_to_use: コミットして, コミット作成, commit changes
allowed-tools: Bash(git:*) Bash(cat:*) Bash(mv:*)
model: haiku
argument-hint: "[context or issue reference]"
---

# /commit - Git Commit Execution

## Input

`$ARGUMENTS` may contain context or an issue reference. Trim whitespace; if empty, analyze staged changes only. If non-empty, treat it as a hint for the message scope or footer.

## Execution

1. Run `git status` and `git diff --staged` in parallel to read the staged changes
2. Generate one message from the changes and `$ARGUMENTS`, following Type Detection and Rules
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

Subject is ≤72 chars, imperative, lowercase, no period. The body carries the why the diff cannot show, such as the motivation or the decision rationale, and is omitted when the diff makes it obvious. Footer uses `BREAKING CHANGE:` / `Closes #123` / `Co-authored-by:`.

```text
feat(auth): add OAuth2 authentication support
feat(api)!: remove deprecated endpoints  # BREAKING CHANGE
```

## Sandbox-Compatible Commit

Confirm the target repository with the leading `git rev-parse --show-toplevel`. If the output differs from the intended one, stop without committing and report the mismatch.

```bash
git rev-parse --show-toplevel
cat > "$TMPDIR/commit-msg.txt" << 'EOF'
<message>
EOF
git commit -F "$TMPDIR/commit-msg.txt"
mv "$TMPDIR/commit-msg.txt" ~/.Trash/ 2>/dev/null || true
```

## Error Handling

| Error             | Action                  |
| ----------------- | ----------------------- |
| No staged files   | Report "Nothing staged" |
| Empty diff        | Return minimal message  |
| No git repository | Report "Not a git repo" |
| Pre-commit failed | Report hook error       |

## Output

Report the executed commit in one line.
