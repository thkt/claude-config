---
name: use-workflow-tdd-cycle
description: TDD with RGRC cycle and Baby Steps.
when_to_use: TDD, テスト駆動, Red-Green-Refactor, Baby Steps
allowed-tools: Read Write Edit Bash(ugrep:*) Bash(bfs:*)
context: fork
background: false
user-invocable: false
---

# TDD Cycle

Test behavior via public API. Mock only at system boundaries.

## Variant Selection

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

## Feature-Driven vs Bug-Driven

| Aspect     | Feature-Driven              | Bug-Driven            |
| ---------- | --------------------------- | --------------------- |
| Trigger    | Specification               | Bug report            |
| Test state | Skip state initially        | Active                |
| Test count | All tests generated upfront | 1 main + edge cases   |
| Activation | User-controlled             | Immediate             |
| Focus      | Feature completion          | Regression prevention |

## Test Philosophy (Classical/Detroit)

| Principle                    | Rule                                                      |
| ---------------------------- | --------------------------------------------------------- |
| Behavior over implementation | Test public API output, not internal calls                |
| State verification           | Assert on result values, not "was X called"               |
| Real objects first           | Use real dependencies. Mock only external I/O             |
| Black-box perspective        | Treat the unit as a black box via its public interface    |
| Sociable tests               | Let collaborators participate. Isolate only at boundaries |

## RGRC Cycle

| Phase    | Goal         | Rule                                                                                   | Common Mistake                 |
| -------- | ------------ | -------------------------------------------------------------------------------------- | ------------------------------ |
| Red      | Failing test | Verify failure matches the intended behavior gap, not syntax/import errors             | Test passes immediately        |
| Green    | Pass test    | "You can sin" - dirty OK                                                               | Over-implementing              |
| Refactor | Refine       | Keep tests green. Shrink only while it reads easier, per ~/.claude/rules/PRINCIPLES.md | Changing behavior; compressing |
| Commit   | Save state   | All checks pass                                                                        | Skipping checks                |

## Baby Steps (2-min cycle)

30s: Write failing test → 1min: Make pass → 10s: Run tests → 30s: Tiny refactor → 20s: Commit if green. Bugs are always in the last 2-minute change.

## Vertical Slices Only

Stack RGRC cycles vertically per behavior. Never expand horizontally by writing all tests first and all implementations later.

```
Wrong (horizontal):
  Red:   test1, test2, test3, test4, test5
  Green: impl1, impl2, impl3, impl4, impl5

Right (vertical):
  Red → Green: test1 → impl1
  Red → Green: test2 → impl2
  ...
```

| #   | Hazard from horizontal slices                                             |
| --- | ------------------------------------------------------------------------- |
| 1   | Bulk-written tests verify imagined behavior instead of real behavior      |
| 2   | Tests degrade into structural assertions of data shape or signature only  |
| 3   | Sensitivity to behavior change drops: pass when broken, fail when correct |
| 4   | Implementation knowledge follows test structure instead of guiding it     |

## Test Failure Judgment

When a test fails, decide whether to fix the test or the implementation. For `/fix`'s bug-driven flow, reproduction steps serve as the spec.

| Judgment | Condition                 | Action                               |
| -------- | ------------------------- | ------------------------------------ |
| Impl bug | Test matches spec/FR-xxx  | Fix implementation. Don't touch test |
| Test bug | Test diverges from spec   | Fix test                             |
| Unclear  | Spec ambiguous or missing | Escalate to user                     |

## Test Design

| Technique                | Use For               | Example                |
| ------------------------ | --------------------- | ---------------------- |
| Equivalence Partitioning | Group same behavior   | Age: <18, 18-120       |
| Boundary Value           | Test edges            | 17, 18, 120, 121       |
| Decision Table           | Multi-condition logic | isLoggedIn × isPremium |

## Assertion Quality

Every test must verify a specific outcome. Weak assertions alone are forbidden. Bad is `expect(result).toBeTruthy()`; good is `expect(result).toEqual({ id: 1, name: "Alice" })`. One test, one concept: if two tests assert the same function with the same argument pattern, merge or parameterize with `test.each`.

| Category           | Matchers                                                                | When acceptable                                   |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------- |
| Weak (existence)   | toBeTruthy, toBeDefined, toBeFalsy, toBeNull, toBeUndefined             | Only with a meaningful assertion in the same test |
| Meaningful (value) | toBe, toEqual, toStrictEqual, toMatch, toContain, toThrow, toHaveLength | Always preferred                                  |
| Meaningful (call)  | toHaveBeenCalledWith, toHaveBeenCalledTimes, toHaveReturnedWith         | When verifying side effects                       |

## Mock

Mock at system boundaries: external APIs, databases, file system, network, non-deterministic dependencies such as time and random, and slow dependencies that block the 2-min cycle.

| Rule                | Threshold                        |
| ------------------- | -------------------------------- |
| Mock count per test | Must not exceed assertion count  |
| Mock scope          | External dependencies only       |
| Mock target         | Never mock the module under test |

| Anti-Pattern                | Problem                                     | Instead                                    |
| --------------------------- | ------------------------------------------- | ------------------------------------------ |
| Assert mock was called      | Tests mock behavior, not component behavior | Assert on observable output or side effect |
| Test-only production method | Pollutes production API for test access     | Extract to test utility or use public API  |
| Mock before understanding   | Hides real dependency behavior              | Understand dependency first, then mock     |
| Partial mock structure      | Missing fields cause false passes           | Mirror complete real API structure         |
| Mock overuse                | More mocks than assertions = testing wiring | Reduce mocks or add meaningful assertions  |

### UT Isolation

Unit tests import only: target module + types + test infrastructure. Build test data from types or literals.

## Test Construction

### AAA Pattern

```typescript
test("name", () => {
  // Arrange - Setup
  // Act - Execute
  // Assert - Verify
});
```

### Naming

| Level | Pattern                                          |
| ----- | ------------------------------------------------ |
| Suite | `describe("[Target]", ...)`                      |
| Group | `describe("[Method]", ...)`                      |
| Test  | `it("when [condition], should [expected]", ...)` |

## Framework Detection

| Condition          | Framework |
| ------------------ | --------- |
| `vitest` in deps   | Vitest    |
| `jest` in deps     | Jest      |
| `bun` as runtime   | Bun test  |
| No framework found | Vitest    |

## References

| Topic          | File                                                    |
| -------------- | ------------------------------------------------------- |
| Feature-driven | ${CLAUDE_SKILL_DIR}/references/feature-driven.md        |
| Bug-driven     | ${CLAUDE_SKILL_DIR}/references/bug-driven.md            |
| Flaky tests    | ${CLAUDE_SKILL_DIR}/references/flaky-test-management.md |
| Coverage       | ${CLAUDE_SKILL_DIR}/../../rules/development/TESTING.md  |
