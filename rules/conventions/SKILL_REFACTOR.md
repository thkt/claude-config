---
paths:
  - ".claude/skills/**"
  - "skills/**"
  - ".ja/skills/**"
---

# Skill Refactor

The order to work in when bringing an existing skill back in line with the conventions. Apply it top to bottom. Clearing the machine-checkable violations before reading leaves only structure and prose to hunt for on the read-through.

| Stage        | What to look at                                                                                        | How to catch it                       |
| ------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| 1 Machine    | Reference notation, `~` or `$HOME` hardcoded paths, heading vocabulary, body and reference line counts | grep and a line count                 |
| 2 Resolution | Where `${CLAUDE_SKILL_DIR}` lands, references into rules, template columns                             | Resolve each path and check it exists |
| 3 Fact       | Whether a stated premise still holds                                                                   | Read the current thing it names       |
| 4 Structure  | Phase ordering, the same operation living in two places                                                | Read through                          |
| 5 Prose      | Intent / operation / judgment split, where prose sits, one sentence carrying several actions           | Read through                          |
| 6 Deletion   | Duplicated instructions, self-description, dead code, history                                          | Read through                          |
| 7 Pinning    | Guard the couplings you fixed with a test                                                              | Break it and confirm it fails         |

## What each stage decides

Stage 1 catches what the conventions already answer, where no judgment is needed. A `${CLAUDE_SKILL_DIR}` wrapped in backticks, a sequential heading inside a Phase, and a body over 100 lines all qualify.

Stage 2 checks against plugin distribution. `~/.claude/skills/<name>/` names the dev tree, so a skill running from a plugin reads a different copy rather than itself.

Stage 3 doubts every premise written as a reason. Agent tools, CLI behavior, and harness variable expansion all drift from what was true when the line was written. Leave out a reason you cannot verify and keep the instruction alone.

Stage 4 orders phases by step, not by stream. Splitting phases per input kind makes the numbering cross streams and sends the reader back and forth between two flows. When one operation appears in several phases, pull it into a phase of its own.

Stage 5 keeps three things apart in one section. Operations go in numbered steps, judgment in a condition-and-treatment table, and the intent leads in one sentence. Prose collects before tables and bullets.

Stage 6 removes an instruction another place already settles, a sentence where the skill describes its own nature, and code that binds a variable nothing reads. When an output template defines the columns, the body does not define them too.

Stage 7 makes a broken coupling fail. Phase numbers, referenced files, and template columns all change on one side without anything noticing.
