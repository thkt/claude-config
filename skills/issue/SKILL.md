---
name: issue
description: Generate a GitHub Issue with a structured title and body. When challenge / research artifacts exist in the conversation, they serve as the body's evidence. When a /think plan draft exists, it moves into the `## Plan` section. Given an issue number, it transfers a plan into a filed issue that has no `## Plan` section.
when_to_use: Issue作って, Issue書いて, Issue作成, GitHub Issue, build に渡す準備, Plan転記
allowed-tools: Bash(gh:*) Bash(cat:*) Bash(ugrep:*) Bash(${CLAUDE_SKILL_DIR}/scripts/*) Read LS AskUserQuestion
model: opus
argument-hint: "[issue description | issue number]"
---

# /issue - GitHub Issue Generation

## Input

Treat `$ARGUMENTS` as the issue description. When it is empty, ask for the description via AskUserQuestion.

When only an issue number or URL arrives, transfer a plan into that filed issue. Take the body via `gh issue view <ref> --json title,body` and start at Phase 2's duplication match. Leave the existing body unchanged except where the plan transfer requires it. Without a plan draft, suggest running `/think` and stop. An issue that already carries a `## Plan` section goes to `/qualify` for inspection instead.

## Language

Read `language` from `~/.claude/settings.json` and generate the issue body in that language. Translate the template's body into it as well. Default to English when it is unset. Headings that come from the template stay in English.

## Phase 1: Drafting

1. Read `.claude/OUTCOME.md`, and generate the stub via `/outcome` when it is absent. Confirm the issue sits inside the outcome state. When it sits outside, ask via AskUserQuestion whether to redefine the non-goal or split it off as its own task
2. Detect the type from the description
3. For a bug, judge whether it is minor, and offer fixing it with `/fix` instead of filing when it is
4. For a feature or a bug whose Why the description does not carry, pin the Why down per ${CLAUDE_SKILL_DIR}/references/why-wall-bouncing.md
5. List the criteria from the description and what step 4 settled, and ask about splitting when two or more are independently implementable
6. With no plan draft, suggest running `/think`. Skipping the suggestion is allowed only for a fix you can judge as fitting in 1-3 files. When the description names an implementation direction, suggest it whatever the extent
7. Select the template and generate the title and body. Settle an open decision with the user through AskUserQuestion, and an unverified fact through Read or ugrep. Neither goes into the body as a guess

### Type detection

Default to `feature` when the type cannot be told. The title takes a bracketed prefix of the capitalized type name, such as `[Feature]`.

| Type    | Use                                                             |
| ------- | --------------------------------------------------------------- |
| bug     | An existing capability fails or behaves off its expected result |
| feature | A new capability, or an extension of an existing one            |
| docs    | Documentation additions or corrections                          |
| chore   | Maintenance, config changes, or dependency updates              |

### The /fix route for minor bugs

A bug is minor when it meets all three criteria below. An intermittent bug whose root cause is unidentified does not qualify. When filing one anyway, note at the end of the body that it is minor and may be handled via `/fix`.

- The change fits within 1 file
- The reproduction steps are settled
- No cross-codebase investigation is needed

### Template source

Take the skeleton per ${CLAUDE_SKILL_DIR}/references/template-source.md. `/slice` chooses in the same order, so change that file when the order changes.

### Split assessment

Offer two options: "keep it as one issue" and "split it into an epic and child issues". A fine-grained check that only verifies one deliverable does not count as an independently implementable criterion. When asking, state for each criterion whether it can be started now. When a criterion depends on something unbuilt, splitting files issues nobody can pick up yet. Publishing several issues is hard to unwind, so never split automatically. Once the split is approved, publish this issue as the epic and run the rest of the flow on that epic.

The title keeps the detected type. Rewriting the prefix to `[Epic]` leaves no skeleton answering to it, so validation fails with `type_mismatch`.

## Phase 2: Refinement

1. Refine the body inline against the criteria in ${CLAUDE_SKILL_DIR}/references/prose-review.md. This does not run when updating a filed issue
2. When the conversation carries a challenge verdict and findings, fold in only the points that belong in the body, once. The verdict and the findings themselves stay out of the body. This does not run when updating a filed issue
3. When a plan draft exists, match the body as the preceding steps left it, following ${CLAUDE_SKILL_DIR}/references/duplication-match.md. That file also decides which draft to match against. Without a plan draft, skip this match. When updating a filed issue, stop at detecting the duplication and edit the body only once AskUserQuestion approves it

## Phase 3: Plan Transfer

Run this only when a /think plan draft exists. Without one, do not create the `## Plan` section at all. Pass the plan draft the Phase 2 match picked to ${CLAUDE_SKILL_DIR}/scripts/pick-plan.py, and move the emitted `plan` and `backlog` into the body as they are. The plan's format and verification are covered at `/think` write-out time and by build's Load validate. Do not change what was moved.

## Phase 4: Publishing

1. Write the body to a temp file with a `cat` heredoc and run ${CLAUDE_SKILL_DIR}/scripts/validate-issue-body.py `<the skeleton chosen in Template source>` `<title>` `<body-file>`. Fix validation errors per ${CLAUDE_SKILL_DIR}/references/validation-errors.md and rerun after fixing. When updating a filed issue the original skeleton cannot be identified, so pass `--content-only <body-file>` instead
2. Present the issue preview. Add nothing new and present what the body carries as it stands. When updating a filed issue, list the sections being changed or added rather than the whole body. Confirm via AskUserQuestion, asking `Create this issue?` for a new filing and `Update this issue?` when updating a filed issue
3. Once validation passed and the user confirmed, attach labels and file it with `gh issue create --title "<title>" --body-file <path>`. Capture the issue URL from the output. When updating a filed issue, write back with `gh issue edit <ref> --body-file <path>`
4. Pick the destination from the table below and suggest it. Launch none of them automatically

| Destination     | Condition                                                                         |
| --------------- | --------------------------------------------------------------------------------- |
| `/qualify`      | The user wants the plan inspected before it goes to implementation                |
| `/slice`        | The split was approved in Phase 1. Pass the epic number that was published        |
| `/fix <number>` | A fix confined to 1-3 files                                                       |
| build workflow  | The change reaches 4 or more files, or it is a new feature. Pass the issue number |

### Publishing constraints

Give `<path>` as a literal absolute path rather than a variable. The hook does not expand a variable, and the filing fails. `priority:*` is required, chosen from critical, high, medium, and low by impact. When the skeleton carries a priority section, align the label with the value written there. When updating a filed issue, align them the same way with `gh issue edit --add-label` if the body's value and the label disagree. Other labels follow the repository's conventions.
