---
name: use-context-root-cause-analysis
description: Root cause analysis by eliminating hypotheses.
when_to_use: root cause, 5 Whys, なぜなぜ分析, 根本原因, 原因分析, symptom fix, 対症療法
allowed-tools: Read Agent Bash(ugrep:*) Bash(bfs:*)
context: fork
user-invocable: false
---

# use-context-root-cause-analysis

## Principle

Fix the root cause, not the symptom. Symptom fixes add complexity; root-cause fixes prevent recurrence.

## Method

${CLAUDE_SKILL_DIR}/../../rules/core/OPERATION.md § Debug Investigation Protocol is canonical. A forked run does not receive the always-loaded rules, so the steps are copied here.

1. Diff working similar code against the broken code and list the differences
2. Raise three or more hypotheses for the cause. Candidates come from ${CLAUDE_SKILL_DIR}/references/symptom-patterns.md
3. Eliminate each by testing. Reach no conclusion while more than one survives
4. The surviving hypothesis is the root cause. Check it with "does fixing this make the symptom go away?"

| Pitfall                          | Treatment                                                          |
| -------------------------------- | ------------------------------------------------------------------ |
| Stopping at the first hypothesis | Start no testing until three are on the table                      |
| Dropping one without a test      | Drop on a run result or on evidence, never on plausibility         |
| Drifting into the abstract       | Stop at the height where an action exists. Do not reach for design |
| Every hypothesis survives        | Sharpen the diff and separate the differences one at a time        |

## Deciding the Pattern

Pattern turns on whether a recurrence path exists, not on how deep the cause sits. Sweep for code shaped like the root cause and classify.

| Value      | Test                                                  |
| ---------- | ----------------------------------------------------- |
| Isolated   | The shape appears nowhere else                        |
| Recurring  | The same shape sits nearby                            |
| Systematic | It comes from the design and the shape crosses layers |

## Output Format

Callers branch on Pattern. `/fix` decides between applying defense-in-depth and delegating to `/research`.

| Field      | Description                       |
| ---------- | --------------------------------- |
| Symptom    | The failure as the user sees it   |
| Root cause | The hypothesis testing left       |
| Pattern    | Isolated / Recurring / Systematic |

## References

| What you are unsure of      | File                                                  |
| --------------------------- | ----------------------------------------------------- |
| How to raise the hypotheses | ${CLAUDE_SKILL_DIR}/references/symptom-patterns.md    |
| How the elimination runs    | ${CLAUDE_SKILL_DIR}/references/hypothesis-examples.md |
