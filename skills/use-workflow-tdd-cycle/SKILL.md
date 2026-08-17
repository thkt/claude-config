---
name: use-workflow-tdd-cycle
description: TDD with RGRC cycle and Baby Steps.
when_to_use: TDD, テスト駆動, Red-Green-Refactor, Baby Steps
allowed-tools: Read Write Edit Bash(ugrep:*) Bash(bfs:*)
context: fork
user-invocable: false
---

# TDD Cycle

Test behavior via public API. Mock only at system boundaries.

## Variant Selection

When the table below does not settle the variant, and when checking whether a test verifies implementation rather than behavior, read ${CLAUDE_SKILL_DIR}/references/test-philosophy.md.

| Trigger                           | Variant         | Reference                                        |
| --------------------------------- | --------------- | ------------------------------------------------ |
| spec.md / new feature (`/code`)   | Feature-driven  | ${CLAUDE_SKILL_DIR}/references/feature-driven.md |
| Bug report / regression (`/fix`)  | Bug-driven      | ${CLAUDE_SKILL_DIR}/references/bug-driven.md     |
| Coverage gap in existing codebase | Coverage-driven | Active tests, no skip. Reuse RGRC below          |

## What to Test

| Priority   | What                                                 |
| ---------- | ---------------------------------------------------- |
| Must       | Business logic, services, critical paths, edge cases |
| Contextual | Complex utils, custom hooks, transformations         |
| Skip       | Simple accessors, UI layout, external lib behavior   |

### When Not to Use TDD

| Context                  | Reason                            |
| ------------------------ | --------------------------------- |
| Throwaway prototypes     | Discard likely, cost > benefit    |
| External API integration | Mock the API, not the integration |
| Simple one-off scripts   | Shorter than the test would be    |
| UI experiments           | Visual first, extract logic later |

## RGRC Cycle

Before writing the test in Red, read ${CLAUDE_SKILL_DIR}/references/writing-tests.md and apply its design techniques, assertion quality, and mock boundaries.

| Phase    | Goal         | Rule                                                                                   | Common Mistake                 |
| -------- | ------------ | -------------------------------------------------------------------------------------- | ------------------------------ |
| Red      | Failing test | Verify failure matches the intended behavior gap, not syntax/import errors             | Test passes immediately        |
| Green    | Pass test    | "You can sin" - dirty OK                                                               | Over-implementing              |
| Refactor | Refine       | Keep tests green. Shrink only while it reads easier, per ~/.claude/rules/PRINCIPLES.md | Changing behavior; compressing |
| Commit   | Save state   | All checks pass                                                                        | Skipping checks                |

## Baby Steps (2-min cycle)

30s. Write failing test → 1min. Make pass → 10s. Run tests → 30s. Tiny refactor → 20s. Commit if green. Bugs are always in the last 2-minute change.

## Vertical Slices Only

Stack RGRC cycles vertically per behavior. Never expand horizontally by writing all tests first and all implementations later.

```text
Wrong (horizontal):
  Red:   test1, test2, test3, test4, test5
  Green: impl1, impl2, impl3, impl4, impl5

Right (vertical):
  Red → Green: test1 → impl1
  Red → Green: test2 → impl2
  ...
```

| #   | Hazard from horizontal slices                                            |
| --- | ------------------------------------------------------------------------ |
| 1   | Bulk-written tests verify imagined behavior instead of real behavior     |
| 2   | Tests degrade into structural assertions of data shape or signature only |
| 3   | Sensitivity to behavior change drops, passing when broken                |
| 4   | Implementation knowledge follows test structure instead of guiding it    |

## Test Failure Judgment

When a test fails, decide whether to fix the test or the implementation. For `/fix`'s bug-driven flow, reproduction steps serve as the spec.

| Judgment | Condition                 | Action                               |
| -------- | ------------------------- | ------------------------------------ |
| Impl bug | Test matches spec/FR-xxx  | Fix implementation. Don't touch test |
| Test bug | Test diverges from spec   | Fix test                             |
| Unclear  | Spec ambiguous or missing | Escalate to user                     |

## References

| Topic           | File                                                    |
| --------------- | ------------------------------------------------------- |
| Writing tests   | ${CLAUDE_SKILL_DIR}/references/writing-tests.md         |
| Test philosophy | ${CLAUDE_SKILL_DIR}/references/test-philosophy.md       |
| Feature-driven  | ${CLAUDE_SKILL_DIR}/references/feature-driven.md        |
| Bug-driven      | ${CLAUDE_SKILL_DIR}/references/bug-driven.md            |
| Flaky tests     | ${CLAUDE_SKILL_DIR}/references/flaky-test-management.md |
| Coverage        | ${CLAUDE_SKILL_DIR}/../../rules/development/TESTING.md  |
