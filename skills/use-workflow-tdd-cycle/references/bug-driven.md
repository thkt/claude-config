# Bug-Driven TDD

How `/fix` uses TDD for bug fixes. Builds on ${CLAUDE_SKILL_DIR}/SKILL.md (RGRC Cycle, Baby Steps).

## Context

| Aspect     | Value                                     |
| ---------- | ----------------------------------------- |
| Source     | Bug description and reproduction steps    |
| Approach   | Write failing test → Fix → Add edge cases |
| Test state | Active; not skipped                       |
| Focus      | Regression prevention                     |

## Workflow

Execution follows the canonical RGRC Cycle in `SKILL.md`. Bug-driven differs in that Red reproduces the exact bug scenario, and edge-case expansion is optional and only after Green.

| Step | Action                                              |
| ---- | --------------------------------------------------- |
| 1    | Reproduce bug → Write failing test → Verify fails   |
| 2    | Fix bug → Minimal implementation → Test passes      |
| 3    | Prevent regression → Add edge case tests (optional) |
| 4    | Verify all tests passing                            |

## Key Characteristics

| Characteristic   | Description        |
| ---------------- | ------------------ |
| Reactive         | Bug → test → fix   |
| Bug-driven       | Reproduction first |
| Regression focus | Prevent recurrence |
| Fast iteration   | Minimal cycle time |

## Decision Points

| Question                  | Criteria                                           |
| ------------------------- | -------------------------------------------------- |
| Skip regression test?     | Doc-only, CSS, config, trivial fix                 |
| Always write test for?    | Logic, security, data, bug fixes                   |
| Generate edge case tests? | Complex bug, critical logic, similar bugs possible |
| How minimal is minimal?   | Only what's necessary, no refactoring              |

## Common Pitfalls

| Pitfall                    | Fix                               |
| -------------------------- | --------------------------------- |
| Test after fixing          | Write failing test first          |
| Test doesn't reproduce bug | Test exact failure scenario       |
| Over-engineering fix       | Simplest solution (Occam's Razor) |
| Not verifying test fails   | Always see Red before Green       |
