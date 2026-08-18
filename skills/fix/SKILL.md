---
name: fix
description: Fix bugs confined to 1-3 files in a development environment. Hand it a filed issue number and that fix carries straight through. Do NOT use for new feature implementation or changes spanning 4 or more files (write the plan via /think and /issue, then hand the number to the build workflow).
when_to_use: バグ修正, 直して, 修正して, fix bug, 不具合
allowed-tools: Bash(git diff:*) Bash(git ls-files:*) Bash(gh issue view:*) Bash(npm test:*) Bash(npm run) Bash(npm run:*) Bash(yarn run:*) Bash(pnpm run:*) Bash(bun run:*) Edit Read LS Agent AskUserQuestion Skill Bash(ugrep:*) Bash(bfs:*)
model: opus
argument-hint: "[bug or issue description]"
---

# /fix - Quick Bug Fix

## Input

The shape of `$ARGUMENTS` decides the entry point. Scope is limited to small, well-understood issues of 1-3 files. When several findings are handed over directly, fix them one at a time, highest severity first. When the impact spans 4+ files, check the multi-file trigger in § Escalation first.

| Pattern                                     | How it is read                                  | Enters at      |
| ------------------------------------------- | ----------------------------------------------- | -------------- |
| A finding carrying `file:line` and severity | Use it as it stands                             | Triage         |
| `/^#?[0-9]+$/`                              | Read the body via `gh issue view <number>`      | Build Check    |
| empty                                       | Ask for the bug description via AskUserQuestion | Outcome Anchor |
| otherwise                                   | Take the text as a bug description              | Outcome Anchor |

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

| Input     | Condition                                                      | Path        |
| --------- | -------------------------------------------------------------- | ----------- |
| Bug desc  | Single location identified + 1-3 line fix + no similar pattern | Obvious     |
| Bug desc  | Intermittent, multiple repro conditions, or unknown root cause | Non-obvious |
| A finding | severity low / medium and a 1-3 line fix                       | Obvious     |
| A finding | severity critical / high, or the fix is non-obvious            | Non-obvious |

## Obvious

1. Apply minimal fix
2. Run the tests and confirm no other test regressed

## Non-obvious

Where the RCA starts depends on the route. A route absent from the table starts from the bug description.

| Route                                                          | What happens to the RCA                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| The finding was handed over directly                           | Pass its file:line and summary as the starting point                   |
| An issue number whose body names the cause down to a file:line | Skip it. Carry that cause as the Root cause and judge only the Pattern |

1. Run the RCA via `Skill("use-context-root-cause-analysis")`
2. `Agent(subagent_type: generator-test)` for the regression test. Pass symptom, repro steps, and the root cause the RCA produced
3. Wait for the generation to finish, then verify the regression test is Red
4. Apply fix
5. Verify regression test is Green and no other tests regressed
6. Apply ${CLAUDE_SKILL_DIR}/references/defense-in-depth.md according to the Pattern

## Escalation

Branch on objective triggers, not confidence self-assessment. When delegating from the issue-number route, confirm the filed issue carries a `## Plan` section, then hand the build workflow its number.

| Destination        | Trigger                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `/research`        | RCA cannot identify a root cause. Pattern is Systematic. Tests still fail on the third fix (re-analyze on the first two) |
| The build workflow | The impact spans 4+ files. The scope is a new feature. Write the Plan via `/think` and `/issue` before handing it over   |
| Ask the user       | The fix falls outside OUTCOME.md scope. Decide whether to redefine Non-goals or write the Plan and delegate to build     |

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
- [ ] Re-audit suggested (findings handed over directly)
