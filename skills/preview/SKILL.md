---
name: preview
description: Matches a PR's diff against the issue's `## Plan` section and returns unimplemented units, missing tests, and out-of-scope changes.
when_to_use: plan 整合性, PR確認, preview PR, plan alignment
allowed-tools: Bash(git:*) Bash(gh:*) Read
model: opus
argument-hint: "[PR URL or number]"
---

# /preview - Plan Alignment Check

## Input

`$ARGUMENTS` is a PR URL, a number, or empty. When empty, detect it from the current branch.

## Execution

1. Identify the PR with `gh pr view $ARGUMENTS --json number,title,body,files,url`. On failure, retry without `$ARGUMENTS`
2. Abort when there is no PR, or the working tree is dirty. Judge it by `git status --porcelain`
3. Settle the source of intent (§ Source of Intent)
4. Read `gh pr diff $PR` and judge each item in § Checks
5. Emit the result per § Output Format

## Source of Intent

Look for these in order and take the first that exists.

1. The `## Plan` section of the originating issue. Reach it with `gh issue view <N>` from an issue reference in the branch name or a commit message
2. A `*.plan.md` under `.claude/workspace/planning/` matching the branch name or the PR title
3. The PR description and the commit messages. Falling this far skips the U-NNN and T-NNN rows, leaving only Scope creep and Impl-wrong

## Checks

Quote the plan line that grounds each flag. A `missing` or `wrong` with no quote is an impression, so drop it.

| Check         | Source                                          | Condition   | Flag         |
| ------------- | ----------------------------------------------- | ----------- | ------------ |
| Unit coverage | U-NNN units in the `## Plan` section            | plan exists | missing      |
| Test coverage | T-NNN acceptance tests in the `## Plan` section | plan exists | missing      |
| Scope creep   | diff vs the source of intent                    | always      | out-of-scope |
| Impl-wrong    | diff behavior vs unit goal / T-NNN              | always      | wrong        |

## Output Format

Emit it to the conversation. Do not save it to a file, and do not post it to the PR.

```text
Plan Alignment: [CLEAN | MISSING <N> | OUT-OF-SCOPE <N> | WRONG <N> | MIXED]
Intent source: <issue #N Plan section | *.plan.md path | PR description | commit messages>
Missing (U): U-NNN - <description> (plan: "<quoted line>")
Missing (T): T-NNN - <description> (plan: "<quoted line>")
Out-of-scope: <file or area> - not traceable to stated intent
Wrong: <U-NNN/T-NNN> - implemented but <gap> (plan: "<quoted line>")
```
