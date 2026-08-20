---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.cjs"
  - "**/*.rs"
  - "**/*.py"
  - "**/*.go"
  - "**/*.swift"
---

# Testing

Covers coverage perspectives, priority areas, test naming, and the delta-based gate.

## Project decisions come first

Read the testing policy in the order the project's `.claude/rules/development/TESTING.md` > the global `~/.claude/rules/development/TESTING.md`. The global side holds the defaults, and only the perspectives the project does not address are filled in from there. How much abnormality is tolerated is settled as a project agreement, not decided per implementation.

## Coverage as Supplementary Indicator

Coverage measures whether code executed, not what was verified. Do not target a number; target perspectives and priority areas.

| Level | Name               | Criterion                                               |
| ----- | ------------------ | ------------------------------------------------------- |
| C0    | Statement coverage | Each line executed at least once                        |
| C1    | Branch coverage    | Both sides of every if / switch hit                     |
| C2    | Condition coverage | Each operand of every compound condition true and false |

## Priority Areas

Do not chase uniform coverage. Cover impact-heavy areas deeper. Depth is the Level to reach for the area. Areas where failure leads directly to monetary loss, unauthorized access, or data loss are C2. Even in C1 areas, raise any spot with a compound condition (&& / || / ternary) to C2.

| Area                      | Examples                              | Depth |
| ------------------------- | ------------------------------------- | ----- |
| Core business rules       | Calculation, decision, transformation | C2    |
| Authorization             | Role check, permission                | C2    |
| Billing / payment         | Amount calculation, rate decision     | C2    |
| Data integrity            | Transaction, unique constraint        | C1    |
| State transition          | State machine                         | C1    |
| User-facing flows         | Booking, checkout                     | C1    |
| Presentational components | Props rendering                       | C0    |
| Thin wrappers             | Pure delegation                       | C0    |

## Test Authoring Sequence

Start from perspectives, and use coverage only to detect gaps.

1. Read the spec of the code under test and list the conditions it must satisfy
2. Pick the perspectives matching the signature and domain from the Perspective Checklist
3. Write tests that satisfy the conditions (Step 1) and perspectives (Step 2)
4. Run coverage; for any uncovered branch / condition, add a test using the matching perspective

### Perspective Checklist

| Perspective    | What to check                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Equivalence    | Group inputs that behave the same and test one representative per group                                              |
| Boundary       | Both sides of every boundary (min - 1 and min, max and max + 1). Add zero and empty as special values                |
| Branch (C1)    | Every path of every if / switch                                                                                      |
| Condition (C2) | Each operand of every compound condition, true and false                                                             |
| Combination    | When 2+ independent conditions interact, write a decision table and cover each row                                   |
| State          | Legal transitions pass, prohibited transitions are rejected                                                          |
| Error          | Feed invalid input / null to exercise exception paths, and assert the error kind returned (status code, error type)  |
| Environment    | Timeout / connection failure / rate limit / unexpected response shape. Apply only when the target calls a dependency |
| Hazard         | Incidents the product can realistically hit, such as double-submit / timezone / permission bypass / partial state    |
| Concurrency    | Race / ordering. Apply only when the target is async / multi-threaded                                                |

## Test Naming

Test names state the spec they verify as a condition and expected result (e.g. "rejects deposit when amount is negative"). The ideal name survives a refactor of the implementation as is. When a name contains implementation vocabulary (method names / internal steps), replace it with the domain's condition and expected-result vocabulary.

## Bug-fix reproduction test

A bug fix adds one test that reproduces the bug before touching the cause, and confirms it fails (Red) before fixing. After the fix, run the full suite and confirm the reproduction test turns green with no regression left behind.

## Whether the test swings at nothing

Break a test the moment it is written and confirm it fails. Choose a break that actually damages what the test guards.

| Shape of the break              | What it looks like                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Input built from the artifact   | Assembling the body from the skeleton and comparing it back. A rename changes both sides, so every rename passes         |
| A missing premise returns empty | Parsing fails, the required set becomes zero, the comparison loses its other side, and everything passes                 |
| A different test fails          | The file broken is another test's fixture. That one fails while the target still passes, so read the failing test's name |

## Test double preference

A dependency closer to the real thing catches integration drift. Pick by the order below, and fall to a lower tier only when a higher one cannot be used (too slow / external side effects / non-deterministic). Assert against observable behavior (return value / state change). Verifying a call itself is reserved for outbound side effects where the call is the spec. A notification send or an audit log qualifies: neither is observable via return value or state. Replace any other call verification with a return-value or state assert.

| Kind | When to use                                                                      |
| ---- | -------------------------------------------------------------------------------- |
| Real | First choice when the real thing is fast enough with closed side effects         |
| Fake | Real thing is slow or external. A lightweight working impl replaces its behavior |
| Stub | When fixing return values alone is enough                                        |
| Mock | Only when the call itself (count / arguments) is the verification target         |

## Coverage Gate

Do not let C0 / C1 drop in a PR. The gate is evaluated on the delta with no absolute floor, avoiding number targeting. Define absolute thresholds in the non-functional requirements when needed (e.g. security tools may keep C0 ≥90%). Exceptions are auto-generated code, data definitions, test files, and legacy code in migration.
