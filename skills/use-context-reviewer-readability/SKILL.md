---
name: use-context-reviewer-readability
description: Code readability review. Do NOT use for security (use-context-reviewer-security), error handling (use-context-reviewer-silence), or test design (use-context-reviewer-testability).
when_to_use: 可読性, 明確, 命名, 変数名, 関数名, ネスト, 関数設計, コメント, 複雑, Miller's Law, ミラーの法則, 認知負荷, AI-generated, 過剰設計
allowed-tools: Read Task Bash(ugrep:*) Bash(bfs:*)
agent: reviewer-readability
context: fork
user-invocable: false
---

# Readability Review

Thresholds are based on cognitive limits such as working memory and one-screen focus, and established metrics such as McCabe complexity.

| Target                | Recommended | Why                                          |
| --------------------- | ----------- | -------------------------------------------- |
| Function lines        | ≤30         | One-screen readability                       |
| File lines            | ≤400        | Module-level cognitive ceiling               |
| Nesting depth         | ≤3          | Branch tracking within working memory        |
| Function arguments    | ≤3          | Argument order memorization limit            |
| Cyclomatic complexity | ≤10         | McCabe 1976: testable without path explosion |

## Detection

| ID  | Pattern                       | Fix                              |
| --- | ----------------------------- | -------------------------------- |
| RD1 | Vague `processData()`         | `validateUserEmail()`            |
| RD1 | Misleading identifiers        | Names reveal intent              |
| RD2 | Nesting > 3 levels            | Guard clauses, extract functions |
| RD2 | Function > 30 lines           | Decompose                        |
| RD3 | Comment: `// increment i`     | Delete; self-evident             |
| RD3 | Comment: `// TODO: fix later` | Create issue or fix now          |
| RD4 | Interface for single impl     | Remove until 2nd impl            |
| RD4 | Class for stateless logic     | Pure function                    |
| RD5 | > 5 function parameters       | Config object or decompose       |

## References

| Topic           | File                                               |
| --------------- | -------------------------------------------------- |
| Control Flow    | ${CLAUDE_SKILL_DIR}/references/control-flow.md     |
| Comments        | ${CLAUDE_SKILL_DIR}/references/comments-clarity.md |
| AI Antipatterns | ${CLAUDE_SKILL_DIR}/references/ai-antipatterns.md  |
| Naming          | ${CLAUDE_SKILL_DIR}/references/naming.md           |
