---
name: issue
description: Generate GitHub Issue with structured title and body. It stands alone and requires no upstream stage. When challenge / research artifacts exist in the conversation, they feed the body's evidence. When a /think plan draft exists, it is transferred into the `## Plan` section. Given an issue number, it transfers a plan into a filed issue that has no Plan section.
when_to_use: Issue作って, Issue書いて, Issue作成, GitHub Issue, prepare for build, Plan転記
allowed-tools: Bash(gh:*) Bash(cat:*) Bash(ugrep:*) Read LS AskUserQuestion
model: opus
argument-hint: "[issue description | issue number]"
---

# /issue - GitHub Issue Generator

## Input

`$ARGUMENTS` is the issue description. If empty, prompt for it via AskUserQuestion.

When it carries only an issue number or URL, transfer a plan into that filed issue. Take the body from `gh issue view <ref> --json title,body` and start at Phase 2's duplication match. The body is someone else's writing and is kept as it stands. Without a plan draft, suggest running `/think` and stop; an issue that already has a `## Plan` goes to `/qualify` for inspection.

## Language

Read `language` from `~/.claude/settings.json` and translate the issue body and templates into that language. If unset, default to English. Template-derived headings stay in English.

## Phase 1: Drafting

1. Read `.claude/OUTCOME.md`, and generate the stub via `/outcome` when it is absent. Confirm the issue lives inside the outcome state. When it falls outside, ask via AskUserQuestion whether to redefine the non-goal or split it off as its own task
2. Detect the type from the description
3. For a bug, judge whether it is minor, and offer fixing it with `/fix` instead of filing when it is
4. For feature / bug, if the Why is not readable from the description, pin it down per ${CLAUDE_SKILL_DIR}/references/why-wall-bouncing.md
5. List the criteria from the description and what step 4 settled, and ask about splitting when two or more are independently implementable
6. When an issue that is not split is bound for the build workflow and no plan draft exists, suggest running `/think`
7. Select the template and generate the title and body. Settle an open decision through AskUserQuestion and an unverified fact through Read or ugrep. Neither goes into the body as a guess

### Type detection

Default to `feature` if unclear. The title takes a bracketed prefix of the capitalized type.

| Type    | When to use                                             |
| ------- | ------------------------------------------------------- |
| bug     | Something existing is broken or not working as expected |
| feature | New capability or enhancement request                   |
| docs    | Documentation additions or corrections                  |
| chore   | Maintenance, config, or dependency updates              |

### The /fix route for minor bugs

Minor names a bug that meets all three criteria below. An intermittent bug with the root cause unidentified does not qualify. When filing anyway, add a footer note to the body, "minor; may be handled via /fix".

- The change fits within 1 file
- The reproduction steps are settled
- No cross-codebase investigation is needed

### Template source

List the entries via `gh api "repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE" --jq '.[].name'` and take the skeleton for the type by working down the table. The repository's own comes first because that is what a web-UI filing uses; ignoring it leaves two shapes of the same issue type in one tracker. The top two state the minimum the web UI makes someone fill in, so a CLI filing that adds sections is not deviating.

| Skeleton                          | Where the section names come from                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| The repository's `<type>.yml`     | Each `body` entry's `attributes.label`. Required only where `validations.required` is true |
| The repository's `<type>.md`      | The body with the leading frontmatter `name` / `about` / `labels` / `title` stripped       |
| The skill's `templates/<type>.md` | The code fence under `## Template`                                                         |

### Split assessment

Offer "keep as one issue" or "split into an epic and child issues". Do not count fine-grained checks that only verify one deliverable; they stay within one issue. Never auto-split, since publishing N issues is hard to unwind. On approval, publish this issue as the epic and run the rest of the flow unchanged on it.

## Phase 2: Refinement

1. Refine the body inline against ${CLAUDE_SKILL_DIR}/references/prose-review.md. The Plan section transferred in Phase 3 is out of scope; leave it untouched. On the number route this step does not run
2. If a challenge verdict / findings exist in the conversation, fold in only the points that belong in the body, once. The verdict and findings themselves never enter the body. On the number route this step does not run
3. When a plan draft exists, match the body as it stands after the preceding steps per ${CLAUDE_SKILL_DIR}/references/duplication-match.md, which also decides which draft to match against. Without one, skip this match. On the number route the match stops at detection, and the body is edited only once AskUserQuestion approves it

## Phase 3: Plan Transfer

Run this phase only when a /think plan draft exists; otherwise omit the section entirely. Read the plan draft Phase 2 picked for the match, and transfer both the `## Plan` and `## Backlog candidates` sections into the body as-is. Format and verification are owned by /think at write-out time and by build's Load validate; do not touch the transferred content.

## Phase 4: Publishing

1. Present the issue preview. Add no new content and mirror what the body already carries. The number route lists the sections it changes and the ones it adds, not the whole body. Then confirm via AskUserQuestion, asking "Create this issue?" for a new filing and "Update this issue?" on the number route.
2. Write the body to a temp file with a `cat` heredoc and run ${CLAUDE_SKILL_DIR}/scripts/validate-issue-body.py <the skeleton chosen in Template source> <title> <body-file>. Handle errors per ${CLAUDE_SKILL_DIR}/references/validation-errors.md and rerun once they are fixed. On the number route this step does not run, because which skeleton the issue was filed from is unknown
3. Once it exits 0, attach labels, run `gh issue create --title "<title>" --body-file <path>`, and capture the issue URL from its output. The number route skips validation and writes back with `gh issue edit <ref> --body-file <path>`
4. Pick the destination from the table below and suggest it. Launch none of them automatically

| Destination     | Condition                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/slice`        | Split was approved in Phase 1. Pass the published epic number                                                           |
| `/fix <number>` | A fix confined to 1-3 files                                                                                             |
| build workflow  | 4 or more files, or a new feature. Pass the number                                                                      |
| `/qualify`      | Inspection wanted before the hand-off to the build workflow. It reads whether the `## Plan` section is fit to implement |

### Publishing constraints

Write `<path>` as a literal absolute path, not a variable, because the hook cannot expand one and the filing stops. `priority:*` is required, set to critical / high / medium / low by impact. When the skeleton carries a priority section, the label matches the value written there. The number route does the same: when the body's value and the label disagree, align them with `gh issue edit --add-label`. Other labels follow the repository's conventions.
