# PREFLIGHT

Confirm scope before implementation. Skip for questions / read-only / follow-up edits to same files / same-session plan continuation.

## Outcome Reference

Read `.claude/OUTCOME.md` at task start and judge scope against the outcome. Skip the re-read when OUTCOME.md was already read earlier in this session. Right before fixing scope, ask "and then what happens after this change?" and verbalize second-order effects (callers, operations, other tasks) in one line.

| Condition                             | Action                                                                |
| ------------------------------------- | --------------------------------------------------------------------- |
| OUTCOME.md absent                     | Generate stub via /outcome                                            |
| Change requested in a non-goal area   | Confirm with user whether to redefine the non-goal or split as a task |
| Change conflicts with Constraints     | Confirm the constraint change with the user and stop                  |
| Change does not advance outcome state | Re-check YAGNI                                                        |

## Interpretation Clarity

| Trigger                                              | Action                                                    |
| ---------------------------------------------------- | --------------------------------------------------------- |
| Interpretations differ and change the resulting work | List them all and wait for confirmation                   |
| Interpretations differ but the work stays the same   | Decide it yourself, state the assumption, and proceed     |
| Task intent is unclear                               | Name what is unclear and stop                             |
| Issue URL or external spec referenced                | Present plan (changes, files, TODO) and wait for approval |

### How to ask

Attach your hypothesis (the answer you expect) to each clarifying question. The user corrects the hypothesis instead of explaining from scratch, and your level of understanding shows at the same time. Once you can predict the answers to the questions you would ask next, understanding is sufficient. Stop asking and move to presenting the plan.

## Task Decomposition

Split when any threshold is exceeded. A task whose title joins two actions with "and" is also a signal of two or more responsibilities; consider splitting it.

Count Files by responsibility. A file and its translation mirror count as one, and a change and the tests covering it count as one.

| Condition | Threshold |
| --------- | --------- |
| Files     | ≥5        |
| Features  | ≥3        |
| Layers    | ≥3        |
| Lines     | ≥200      |

## Rationalization Counters

| Excuse                               | Counter                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Simple follow-up                     | Check the minimum scope and eliminate unneeded scope changes              |
| Already understand the codebase      | Check when you last read the target files, then verify                    |
| User wants speed over process        | Implementing with the right process ends up faster                        |
| Covered by the plan                  | Scope check verifies current state, which a plan does not                 |
| Root fix is too costly               | Leave cost judgment to the user                                           |
| Implement from scratch               | Search the project for existing implementations before writing            |
| This existing code looks unnecessary | Do not remove it until you can explain why it exists (Chesterton's Fence) |
