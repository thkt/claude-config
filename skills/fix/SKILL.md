---
name: fix
description: Rapidly fix small bugs and minor improvements in development environment. Hand it a filed issue number and a fix confined to 1-3 files carries straight through. Do NOT use for new feature implementation or changes spanning 4 or more files (write the plan via /think and /issue, then hand the number to the build workflow).
when_to_use: バグ修正, 直して, 修正して, fix bug, 不具合
allowed-tools: Bash(git diff:*) Bash(git ls-files:*) Bash(gh issue view:*) Bash(npm test:*) Bash(npm run) Bash(npm run:*) Bash(yarn run:*) Bash(pnpm run:*) Bash(bun run:*) Edit Read LS Agent AskUserQuestion Skill Bash(ugrep:*) Bash(bfs:*)
model: opus
argument-hint: "[bug or issue description]"
---

# /fix - Quick Bug Fix

## Input

The shape of `$ARGUMENTS` decides the entry point. Scope is limited to small, well-understood issues of 1-3 files. When Direct Finding Input carries multiple findings, fix them one at a time in descending severity order. When the impact spans 4+ files, check the multi-file trigger in § Escalation first.

| Pattern                                       | Mode                 | What it reads                                                                                                              | Enters at      |
| --------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Finding with file / line / severity / summary | Direct Finding Input | Return value of the audit workflow, as a single JSON finding or as text. Use file:line as the RCA starting point           | Triage         |
| `/^#?[0-9]+$/`                                | Issue Handoff        | The body via `gh issue view <number>`. Why and the repro steps become the bug description, Premises the givens             | Build Check    |
| empty                                         | Fix Prompt           | Fix type from Bug fix / Error message / Test failure and Description as free text via Other, asked through AskUserQuestion | Outcome Anchor |
| otherwise                                     | Standard Flow        | The text itself, as a bug description                                                                                      | Outcome Anchor |

## Delegation Map

| Type  | Target                            | Purpose                                    |
| ----- | --------------------------------- | ------------------------------------------ |
| Skill | `use-context-root-cause-analysis` | 5 Whys for non-obvious bugs                |
| Agent | `generator-test`                  | Regression test from symptom + repro steps |
| Agent | `resolver-build`                  | TypeScript or build error triage           |

## Outcome Anchor

Read `.claude/OUTCOME.md` before Build Check. If absent, generate the stub via /outcome. Confirm the bug or fix lives inside the outcome state. If outside, § Escalation.

## Build Check

Detect the build command from package.json or project config and run it.

| Result       | Action                                           |
| ------------ | ------------------------------------------------ |
| Build errors | `Agent(subagent_type: resolver-build)`, then END |
| No errors    | Continue to Triage                               |

## Triage

Obvious skips both RCA and regression test generation, so it is limited to findings with low misfix risk.

| Input                | Condition                                                      | Path        |
| -------------------- | -------------------------------------------------------------- | ----------- |
| Bug desc             | Single location identified + 1-3 line fix + no similar pattern | Obvious     |
| Bug desc             | Intermittent, multiple repro conditions, or unknown root cause | Non-obvious |
| Direct Finding Input | severity low / medium and a 1-3 line fix                       | Obvious     |
| Direct Finding Input | severity critical / high, or the fix is non-obvious            | Non-obvious |

## Obvious

1. Apply minimal fix
2. Run the tests and confirm no other test regressed

## Non-obvious

1. Run 5 Whys via `Skill("use-context-root-cause-analysis")`. If via Direct Finding Input, pass the finding's file:line and summary as the 5 Whys starting point. Output Symptom / Root cause / Pattern. When an Issue Handoff body already names the cause down to a file:line, skip the 5 Whys, carry that cause as the Root cause, and judge only the Pattern.
2. `Agent(subagent_type: generator-test)` for the regression test. Pass symptom, repro steps, and the root cause from step 1. The spawn runs in the background and its result arrives as a completion notification
3. Verify the regression test is Red once the completion notification arrives
4. Apply fix
5. Verify regression test is Green and no other tests regressed
6. If Pattern is Recurring or Systematic, apply ${CLAUDE_SKILL_DIR}/references/defense-in-depth.md

## Escalation

Branch on objective triggers, not confidence self-assessment. When delegating from the Issue Handoff path, confirm the filed issue carries a `## Plan` section, then hand the build workflow its number.

| Trigger                        | Action                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------- |
| RCA cannot identify root cause | Escalate to `/research`                                                       |
| Tests still fail after fix     | Re-analyze root cause. After 3 failures, escalate to `/research`              |
| Multi-file impact (4+ files)   | Write the Plan via `/think` and `/issue`, then delegate to build              |
| New feature scope              | Write the Plan via `/think` and `/issue`, then delegate to build              |
| Pattern = Systematic           | Escalate to `/research`                                                       |
| Fix outside OUTCOME.md scope   | Confirm with user; redefine Non-goals or write the Plan and delegate to build |

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
- [ ] Re-audit suggested (Direct Finding Input path)
