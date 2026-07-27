# Feature-Driven TDD

How `/code` uses TDD for new feature development. Builds on ${CLAUDE_SKILL_DIR}/SKILL.md (RGRC Cycle, Baby Steps).

## Context

| Aspect   | Value                                |
| -------- | ------------------------------------ |
| Source   | spec.md with functional requirements |
| Approach | Generate all tests in skip state     |
| Order    | Simple → Complex (Baby Steps)        |
| Control  | User activates one test at a time    |

## Workflow

Per-test execution follows the canonical RGRC Cycle in `SKILL.md`. Feature-driven differs in that Red starts by removing `.skip` from the next selected test.

| Step | Action                                                      |
| ---- | ----------------------------------------------------------- |
| 1    | Read spec.md → Extract FR-xxx → Identify Given-When-Then    |
| 2    | Generate skipped tests (`it.skip()`) ordered simple→complex |
| 3    | Interactive activation: [Y]es/[S]kip/[Q]uit → RGRC cycle    |
| 4    | Repeat until all tests active and passing                   |

## Framework Skip Markers

| Framework   | Skip Syntax                                         |
| ----------- | --------------------------------------------------- |
| Jest/Vitest | `it.skip('test', () => { // TODO: [SKIP] FR-001 })` |
| Mocha       | `it.skip()` or `xit()`                              |
| Unknown     | `// TODO: [SKIP]` marker                            |

## Key Characteristics

| Characteristic  | Description                 |
| --------------- | --------------------------- |
| Proactive       | Tests before implementation |
| Spec-driven     | Requirements → tests → code |
| User-controlled | Explicit activation         |
| Baby Steps      | One test at a time          |

## Decision Points

| Question           | Answer                              |
| ------------------ | ----------------------------------- |
| When to skip test? | Too complex, dependencies not ready |
| When to commit?    | All tests green, code refactored    |
| Commit frequency   | Every test activation (~5-10 min)   |

## Common Pitfalls

| Pitfall                    | Fix                           |
| -------------------------- | ----------------------------- |
| Activating multiple tests  | One test at a time only       |
| Implementation before test | Activate test first (Red)     |
| Skipping Refactor phase    | Always clean up before commit |
