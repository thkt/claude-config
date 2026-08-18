# Prose Review

Write for a teammate who shares the context and can open the links. A PR carries the intent of the diff and the review path; the code's what is carried by the diff itself. Do not write a line whose removal would not mislead the reader. Lexical empty phrases and sentence shape belong to `~/.claude/rules/conventions/PROSE.md`; apply it alongside this file.

## Structure

| Check          | Question                                                             |
| -------------- | -------------------------------------------------------------------- |
| Why stated     | Is the why of the change, not just the what, in the top 1-3 lines?   |
| Test evidence  | Is verification concrete: command run, test file, screenshot link?   |
| Scope          | Is the change focused, or does it bundle unrelated edits?            |
| Reviewer focus | Is the review priority clear via "focus on X" or "skim Y"?           |
| Risk surfaced  | Are migration, rollback, or performance risks called out explicitly? |

## Redundancy patterns

Fix redundancy of the same nature even when the table below does not name it.

| Pattern            | Fix                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Diff transcription | Drop enumerations of changed files or functions; the diff carries them. Keep the intent of the change |
