# Duplication match

Used in Phase 2 only when a plan draft exists. Match against the `/think` draft in the conversation when there is one. Otherwise take the `*.plan.md` under `.claude/workspace/planning/` that matches the issue title and carries the newest modification time. The target is every place the body and `## Plan` carry the same knowledge. Two places carry the same knowledge when editing one forces the other to change; what can change independently stays in both.

Replace the duplicated body side with a `## Plan` reference. The reference runs from the body to `## Plan`. Three things stay in the body after the replacement. One line that states what change that heading covers, the rejection reason with its file:line grounds, and the pain description.

When they conflict, treat the plan as the source of truth and correct the body, because `/think` writes the plan out to a standalone file that predates the body and the body's sections come into existence after it. Acceptance Criteria overlaps Outcome as well. It stays in the body because it drives the human merge call and never reaches build.

| Body section      | Plan counterpart |
| ----------------- | ---------------- |
| Approach          | unit contract    |
| Testing Decisions | T-NNN            |
| Scope, In scope   | files            |
