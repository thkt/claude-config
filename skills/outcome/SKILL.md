---
name: outcome
description: Generates and updates .claude/OUTCOME.md interactively. When the file is absent or empty (Behavior blank or TBD only), collects content via AskUserQuestion and writes the stub; when present, shows the current state and applies updates.
when_to_use: OUTCOME作って, OUTCOME更新, アウトカム定義, create outcome, update outcome
allowed-tools: Read Write Edit AskUserQuestion Bash(${CLAUDE_SKILL_DIR}/scripts/*)
model: opus
---

# /outcome - OUTCOME.md generation and update

The landing point when another skill detects a missing OUTCOME.md. Returning a hard stop or a warning leaves the outcome empty, so collect it interactively and generate.

## Branch

Run `${CLAUDE_SKILL_DIR}/scripts/validate-outcome.py .claude/OUTCOME.md` and enter the flow its JSON `flow` names. The script owns the criteria; the table below reads the mapping.

| state  | Condition                   | flow     |
| ------ | --------------------------- | -------- |
| absent | File absent                 | generate |
| empty  | Behavior blank, or TBD only | generate |
| ok     | Behavior carries content    | update   |

## Generate

1. Read ${CLAUDE_SKILL_DIR}/templates/outcome.md
2. Collect Behavior, Non-goals, Constraints in one AskUserQuestion call, one question per item. Behavior needs 1 or more entries with the subject named
3. Run each Behavior through the Outcome test; rewrite failures and re-present to the user
4. Fill the template and Write `.claude/OUTCOME.md`. Skip the opening prose, which is not collected, and drop Indicators with its heading
5. Re-run validate-outcome.py and fix until `errors` is empty. `placeholder_left` is a surviving placeholder, `missing_section` a dropped heading

## Update

1. Read `.claude/OUTCOME.md` and present the current three sections
2. Confirm which sections change and their content via AskUserQuestion
3. Run each changed Behavior through the Outcome test, then Edit
4. Re-run validate-outcome.py and confirm `errors` is empty
