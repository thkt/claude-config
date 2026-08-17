---
name: preview
description: AI screening review for PRs - preliminary check before human review. Do NOT use for deep multi-reviewer code quality audits (use /audit instead).
when_to_use: スクリーニング, PRレビュー, プレビュー, preview PR, pre-review
allowed-tools: Bash(git:*) Bash(gh:*) Read AskUserQuestion Bash(ugrep:*) Bash(bfs:*)
model: opus
argument-hint: "[PR URL or number]"
---

# /preview - PR Screening Review

## Input

`$ARGUMENTS` is a URL, a number, or empty. If empty, detect from the current branch.

## Execution

1. Identify the PR with `gh pr view $ARGUMENTS --json number,title,body,labels,files,url`. On failure, retry without `$ARGUMENTS`
2. Abort if no PR found or working tree is dirty. Check via `git status --porcelain`
3. Check out the PR with `gh pr checkout $PR`
4. Gather PR context in parallel (§ PR context gathering)
5. Read each changed file in full, including code outside the diff hunks
6. Review per process: overview → per-file → dependency impact → findings
7. Output structured screening report

### PR Context Gathering

Never include `author` in gh output fields.

```bash
# Diff
gh pr diff $PR

# Existing comments
gh pr view --comments $PR

# Inline comments
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  --jq '.[] | {file: .path, user: .user.login, comment: .body}'
```

## Comment Labels

| Label    | Meaning                         | Severity |
| -------- | ------------------------------- | -------- |
| `[must]` | Requires fix before merge       | High     |
| `[want]` | Should fix, not blocking        | Medium   |
| `[imo]`  | Personal opinion, take or leave | Low      |
| `[ask]`  | Question needing clarification  | -        |
| `[nits]` | Minor style/formatting issue    | Low      |
| `[info]` | Context sharing, no action      | -        |

## Comment Tone

| Rule            | Detail                                                                             |
| --------------- | ---------------------------------------------------------------------------------- |
| Format          | `[label] <observed behavior or risk>. <suggestion>. (file:line)`                   |
| Concise         | 3 lines for `[imo]`/`[nits]`/`[info]`; up to 5 for `[must]`/`[want]` with evidence |
| Respectful      | Acknowledge effort, avoid commands                                                 |
| Suggestive      | "Consider..." not "This is wrong"                                                  |
| Author-targeted | Comments may be posted verbatim - calibrate detail for the PR author               |

## Output

Generate the report from the ${CLAUDE_SKILL_DIR}/templates/screening-report.md skeleton and emit it to the conversation.

## Rules

| Rule               | Detail                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| No auto-post       | Never post comments to PR automatically                                |
| Abort on dirty     | If uncommitted changes exist, warn and abort                           |
| Speed over depth   | This is screening, not full audit                                      |
| Verify before flag | Before [ask]/[want]+, trace the issue to a reachable runtime call site |

## References

| Topic            | File                                               |
| ---------------- | -------------------------------------------------- |
| Review Checklist | ${CLAUDE_SKILL_DIR}/references/review-checklist.md |
