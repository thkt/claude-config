# OUTCOME

The rule definition that concretizes CLAUDE.md's Foundation Outcome-driven principle at the repository level. The actual instance lives at `.claude/OUTCOME.md` in each repository, kept out of the repo root so it reads separately from CLAUDE.md. An additive layer; no migration mandate for existing CLAUDE.md files.

## Why this exists

Per-repository outcome state is left vague in practice, contaminating every downstream decision (scope, priority, what to cut). OUTCOME.md converts it into visible state, and the act of writing it is the discovery moment.

## Outcome test

Run each candidate outcome statement through these checks. If any fails, rewrite.

| Check                      | Pass condition                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Subject named              | The statement describes the state of a subject (human / AI agent / system)           |
| Implementation-independent | The statement still holds if the implementation is rewritten end to end              |
| Done state                 | The statement describes the state in the done condition, not an activity in progress |
| Observable                 | An external observer can verify the state without reading the source                 |

## Content

Behavior follows `../conventions/PROSE.md` strictly. The project's reason for being and Indicators are optional, and aspirational vague terms are permitted only in these two.

| Section       | What                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Outcome state | Opening prose. Behavior in the done state (required, ≥1). Indicators (Time / Error rate / Value) |
| Non-goals     | Explicitly out of scope                                                                          |
| Constraints   | Immovable technical, legal, or organizational limits                                             |

## Update triggers

| Trigger               | Action                                                      |
| --------------------- | ----------------------------------------------------------- |
| Outcome state reached | Roll the filled Behavior and Indicators into the next phase |
| Non-goals changed     | Update Non-goals                                            |
| Constraints changed   | Update Constraints                                          |
| Six months elapsed    | Review all sections                                         |
