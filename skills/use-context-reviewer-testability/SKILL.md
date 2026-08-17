---
name: use-context-reviewer-testability
description: Testable code design review. Do NOT use for security (use-context-reviewer-security) or readability (use-context-reviewer-readability).
when_to_use: テスト容易性, モック, mock-friendly, DI
allowed-tools: Read Task Bash(ugrep:*) Bash(bfs:*)
agent: reviewer-testability
context: fork
user-invocable: false
---

# Testability Review

## Detection

| ID  | Pattern                      | Fix                             |
| --- | ---------------------------- | ------------------------------- |
| TE1 | Direct `import { db }` usage | Inject dependency as parameter  |
| TE1 | `new Service()` inside class | Constructor injection           |
| TE2 | `fetch()` inside component   | Extract to hook/service, inject |
| TE2 | Mixed side effects + logic   | Separate pure/impure            |
| TE3 | Deep mock chains             | Simplify dependencies           |
| TE4 | Global `config` access       | Pass config as prop/parameter   |
| TE4 | `Date.now()` in logic        | Inject clock/time provider      |
| TE5 | Tight coupling               | Depend on abstractions (DIP)    |

## Criteria

Test setup < 10 lines. No deep mock chains. Dependencies explicit.

## References

| Topic   | File                                                   |
| ------- | ------------------------------------------------------ |
| DI      | ${CLAUDE_SKILL_DIR}/references/dependency-injection.md |
| Pure    | ${CLAUDE_SKILL_DIR}/references/pure-functions.md       |
| Mocking | ${CLAUDE_SKILL_DIR}/references/mock-friendly.md        |
