# Duplication match

Used in Phase 2 only when a plan draft exists. When the conversation carries a `/think` plan draft, pick that one to match against. Without one, pass the issue title to ${CLAUDE_SKILL_DIR}/scripts/pick-plan.py. When it returns a `path`, pick that draft. When `ambiguous` is true, put `candidates` to the user with AskUserQuestion and ask them to choose.

Match every place where the body and `## Plan` carry the same knowledge. Two places carry the same knowledge when editing one forces the other to change. What can change independently stays in both.

Replace the duplicated body side with a reference to `## Plan`. The reference runs from the body to `## Plan`. Three things stay in the body after the replacement.

- One line that states what change that heading covers
- The rejection reason with the `file:line` that grounds it
- The description of the pain

When the body and the plan conflict, treat the plan as the source of truth and correct the body. This follows the order `/think` works in: it writes the plan out to a standalone file first, and the body's sections come into existence after it. Acceptance Criteria overlaps Outcome as well. Acceptance Criteria still stays in the body, because it drives the human merge call and never reaches build.

| Body section      | Plan counterpart |
| ----------------- | ---------------- |
| Approach          | unit contract    |
| Testing Decisions | T-NNN            |
| Scope, In scope   | files            |
