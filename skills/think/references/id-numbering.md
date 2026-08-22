# Assigning ids

Number the units and the acceptance tests. The shape is a `U-001` / `T-001` sequence, with T-NNN unique across the whole plan.

Build's Load stops a duplicate id at the id cross-check. A number that disagrees with the target repo's convention leaves the rename to implementation time.

| Target repo       | How to number                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Uses prefixed ids | Follow that convention as `T-SK077`, continuing from that prefix's repo-wide max                                         |
| Carries no prefix | Plan-wide uniqueness does not reach inside a single file, so skip the numbers already used in the file the tests land in |

## The statement's language

Write a T-NNN statement in the language of the side the test lands on. `/think` settles that the sentence becomes the test name as written, so the plan's language is the test name's language.

In a repo that pairs `.ja/` with an English side, tests live on the English side only (`rules/conventions/MIRROR.md`). A Japanese T-NNN handed there makes the implementer write a Japanese test name, exactly as instructed, and the name lands outside the convention. Keep T-NNN statements English even when the rest of the plan is Japanese.
