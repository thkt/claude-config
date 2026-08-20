# Prose Review

Write for a teammate who shares the context and can open the links. A PR body states the intent of the diff and the review path. What the code changed is readable from the diff itself. Write only a line that changes what the reader decides. This review checks the structure of a PR body alone.

## Structure

| Check          | Question                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Why stated     | Is the why of the change, not just the what, in the top 1-3 lines?                             |
| Test evidence  | Is verification concrete: command run, test file, screenshot link?                             |
| Scope          | Is the change focused, or does it bundle unrelated edits?                                      |
| Reviewer focus | Is the review priority clear via "focus on X" or "skim Y"? pr-writing.md settles where it goes |
| Risk surfaced  | Are migration, rollback, or performance risks called out explicitly?                           |

## Redundancy patterns

Fix redundancy of the same nature even when the table below does not name it.

| Pattern            | Fix                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Diff transcription | Drop enumerations of changed files or functions. The diff already shows them. Keep the intent of the change |
