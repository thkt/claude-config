---
name: fix
description: Rapidly fix small bugs and minor improvements in development environment. Hand it a filed issue number and a fix confined to 1-3 files carries straight through. Do NOT use for new feature implementation or changes spanning 4 or more files (hand the number to the build workflow instead).
when_to_use: バグ修正, 直して, 修正して, fix bug, 不具合
allowed-tools: Bash(git diff:*) Bash(git ls-files:*) Bash(gh issue view:*) Bash(npm test:*) Bash(npm run) Bash(npm run:*) Bash(yarn run:*) Bash(pnpm run:*) Bash(bun run:*) Edit MultiEdit Read LS Task AskUserQuestion Skill Bash(ugrep:*) Bash(bfs:*)
model: opus
argument-hint: "[bug or issue description]"
---

# /fix - Quick Bug Fix

## Input

`$ARGUMENTS` holds one of four forms: a bug description, a finding ID from a `/audit` snapshot in `${CLAUDE_SKILL_DIR}/../../workspace/history/` (e.g., `RC-001`, `SEC-003`), a finding returned by a standalone audit workflow run, or the number of a filed issue. Scope is limited to small, well-understood issues of 1-3 files. When Direct Finding Input carries multiple findings, handle them one at a time in descending severity order. When the impact spans 4+ files, check the multi-file trigger in § Escalation first.

| Pattern                                       | Mode                  | Action                                                                                                                                                                                                                                            |
| --------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/^[A-Z][A-Z0-9]*-[0-9]+$/`                   | Finding ID Resolution | Read the latest snapshot from `${CLAUDE_SKILL_DIR}/../../workspace/history/` and find the ID match in findings[]. Carry severity and summary, skip Outcome Anchor and Build Check, enter Triage. If absent, present error + suggest Standard Flow |
| Finding with file / line / severity / summary | Direct Finding Input  | Return value of the audit workflow: a single JSON finding, or text carrying file:line + severity + summary. Use file:line as the RCA starting point, skip Outcome Anchor and Build Check, enter Triage                                            |
| `/^#?[0-9]+$/`                                | Issue Handoff         | Read the body with `gh issue view <number>`. Use Why and the repro steps as the bug description, Premises as the givens. Skip Outcome Anchor and enter Build Check                                                                                |
| empty                                         | Fix Prompt            | Ask via AskUserQuestion for Fix type from Bug fix / Error message / Test failure and Description as free text via Other, then execute                                                                                                             |
| otherwise                                     | Standard Flow         | Treat as a bug description and run from Outcome Anchor                                                                                                                                                                                            |

## Delegation Map

| Type      | Target                                               | Purpose                                           |
| --------- | ---------------------------------------------------- | ------------------------------------------------- |
| Skill     | `use-context-root-cause-analysis`                    | 5 Whys for non-obvious bugs                       |
| Agent     | `generator-test`                                     | Regression test from symptom + repro steps        |
| Agent     | `resolver-build`                                     | TypeScript or build error triage                  |
| Reference | `${CLAUDE_SKILL_DIR}/references/defense-in-depth.md` | Multi-layer validation for Recurring / Systematic |

## Outcome Anchor

Read `.claude/OUTCOME.md` before Build Check. If absent, generate the stub via /outcome. Confirm the bug or fix lives inside the outcome state. If outside, § Escalation.

## Build Check

Detect the build command from package.json or project config and run it.

| Result       | Action                                                |
| ------------ | ----------------------------------------------------- |
| Build errors | `Task` with `subagent_type: resolver-build`, then END |
| No errors    | Continue to Triage                                    |

## Triage

Obvious skips both RCA and regression test generation, so it is limited to findings with low misfix risk.

| Input                 | Condition                                                      | Path        |
| --------------------- | -------------------------------------------------------------- | ----------- |
| Bug desc              | Single location identified + 1-3 line fix + no similar pattern | Obvious     |
| Bug desc              | Intermittent, multiple repro conditions, or unknown root cause | Non-obvious |
| finding (ID / direct) | severity low / medium and a 1-3 line fix                       | Obvious     |
| finding (ID / direct) | severity critical / high, or the fix is non-obvious            | Non-obvious |

## Obvious

1. Apply minimal fix
2. Run tests covering affected code if any exist

## Non-obvious

1. Run 5 Whys via `Skill("use-context-root-cause-analysis")`. If via Finding ID or Direct Finding Input, pass the finding's file:line and summary as the 5 Whys starting point. Output Symptom / Root cause / Pattern.
2. `Task(subagent_type: generator-test)` for the regression test. Pass symptom, repro steps, and the root cause from step 1
3. Verify regression test is Red
4. Apply fix
5. Verify regression test is Green and no other tests regressed
6. If Pattern is Recurring or Systematic, apply `${CLAUDE_SKILL_DIR}/references/defense-in-depth.md`

## Escalation

Branch on objective triggers, not confidence self-assessment. Do not attempt fix #4 without escalating. When delegating from the Issue Handoff path, hand the build workflow the number that is already filed.

| Trigger                        | Action                                                                  |
| ------------------------------ | ----------------------------------------------------------------------- |
| RCA cannot identify root cause | Escalate to `/research`                                                 |
| Tests still fail after fix     | Re-analyze root cause. After 3 failures, escalate to `/research`        |
| Multi-file impact (4+ files)   | Refine via `/issue` and delegate to the build workflow                  |
| New feature scope              | Refine via `/issue` and delegate to the build workflow                  |
| Pattern = Systematic           | Escalate to `/research`                                                 |
| Fix outside OUTCOME.md scope   | Confirm with user; redefine Non-goals or delegate to the build workflow |

## Error Handling

| Error                  | Action                                 |
| ---------------------- | -------------------------------------- |
| resolver-build fails   | Present error, ask user for guidance   |
| generator-test timeout | Skip regression test, proceed with fix |

## Completion

Not done until every item holds. A parenthesized item is required only when it applies.

- [ ] Root cause identified (Non-obvious path)
- [ ] All tests pass
- [ ] Pattern field recorded from RCA (Non-obvious path)
- [ ] defense-in-depth applied (Recurring / Systematic only)
- [ ] Re-audit suggested (Finding ID / Direct Finding Input path)
