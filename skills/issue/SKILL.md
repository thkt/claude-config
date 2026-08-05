---
name: issue
description: Generate GitHub Issue with structured title and body. Standalone; requires no upstream stage. When challenge / research artifacts exist in the conversation, they feed the body's evidence; when a /think plan draft exists, it is transferred into the `## Plan` section. Given an issue number, it transfers a plan into a filed issue that has no Plan section.
when_to_use: Issue作って, Issue書いて, Issue作成, GitHub Issue, prepare for build, Plan転記
allowed-tools: Bash(gh:*) Bash(cat:*) Bash(ugrep:*) Read AskUserQuestion
model: opus
argument-hint: "[issue description | issue number]"
---

# /issue - GitHub Issue Generator

A standalone issue-creation skill. When `/challenge` / `/research` / `/think` artifacts exist in the conversation context, use them: the `/challenge` verdict for the posting judgment, `/research` findings as the body's evidence, and `/think`'s plan draft transferred into the `## Plan` section. The human decides which stages an issue goes through.

## Input

`$ARGUMENTS` is the issue description. If empty, prompt for it via AskUserQuestion.

When it carries only an issue number or URL, transfer a plan into that filed issue. Take the body from `gh issue view <ref> --json title,body` as the already-drafted body, start at Phase 2, and replace Phase 4's creation with `gh issue edit <ref> --body-file <path>`, skipping body validation. Without a plan draft, suggest running `/think` and stop; an issue that already has a `## Plan` goes to `/qualify` for inspection.

## Language

Read `language` from `~/.claude/settings.json` and translate the issue body and templates into that language. If unset, default to English. Only identifiers, code, commands, and proper nouns stay in English; do not mix loose English words that have a plain equivalent in the configured language into the prose. Template-derived headings and Plan-section extraction keywords stay in English.

## Phase 1: Drafting

1. Read `.claude/OUTCOME.md` if present and check that the issue serves the outcome
2. Detect the type from the description
3. For feature / bug, if the Why is not readable from the description, pin it down through wall-bouncing
4. Select the template, generate the title + body, and mark fixed / tentative per the confidence-marking criteria
5. Assess whether the issue is epic-sized and should split

### Type detection

Default to `feature` if unclear. The title takes a bracketed prefix of the capitalized type.

| Type    | When to use                                             |
| ------- | ------------------------------------------------------- |
| bug     | Something existing is broken or not working as expected |
| feature | New capability or enhancement request                   |
| docs    | Documentation additions or corrections                  |
| chore   | Maintenance, config, or dependency updates              |

### The /fix route for minor bugs

What this decides is whether to file at all. A bug meeting all three criteria below is minor, and handling it directly via /fix without filing is an option. When filing anyway, add a footer note to the body, "minor; may be handled via /fix". An intermittent bug with the root cause unidentified does not qualify.

- The change fits within 1 file
- The reproduction steps are settled
- No cross-codebase investigation is needed

### Why wall-bouncing

Establish the issue's Why before drafting the body. One question per message, attaching the answer you expect as the hypothesis in the recommended option. Questions the codebase can answer are explored via Read / ugrep before asking. Once the three points below are readable from the description, or you can predict the answers to the questions you would ask next, stop asking and move to drafting.

| Question                                    | Where it lands in the body |
| ------------------------------------------- | -------------------------- |
| Who needs this?                             | What & Why                 |
| What pain exists, and what is the evidence? | What & Why                 |
| What measurable result counts as success?   | Acceptance Criteria        |

### Template source

List the entries via `gh api "repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE" --jq '.[].name'` and take the skeleton for the type in this order: `<type>.yml` (issue form) > `<type>.md` > `templates/<type>.md` directly under the skill directory. The repository's own template comes first because that is what a web-UI filing uses; a CLI filing that ignores it leaves two shapes of the same issue type in one tracker.

For a `.yml`, each `body` entry's `attributes.label` becomes a section name and only those with `validations.required` true are required. A form states the minimum the web UI makes someone fill in, so a CLI filing that adds sections to it is not deviating. For a `.md`, strip the leading frontmatter fields `name` / `about` / `labels` / `title` for the skeleton.

### Confidence marking

Requirements the user decided stay unmarked. Add an inline `(tentative: <action at pickup>)` only to decisions the user left open and facts not yet verified. Do not write an uncertain HOW at all.

| Point                | Content                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Marker language      | Stays `tentative` whatever language the body is in, as build's extraction keyword                          |
| Issue-level premises | feature and bug put them in the Premises section; chore and docs mark them inline                          |
| Downstream handling  | build extracts them as assumptions and surfaces them on the draft PR as veto targets the user can overturn |

### Split assessment

When two or more criteria are each independently implementable, ask via AskUserQuestion whether to split, offering "keep as one issue" or "split into an epic and child issues". Do not count fine-grained checks that only verify one deliverable; they stay within one issue. Never auto-split, since publishing N issues is hard to unwind. On approval, publish this issue as the epic and run the rest of the flow unchanged on it.

## Phase 2: Refinement

1. Refine the body inline against `${CLAUDE_SKILL_DIR}/references/prose-review.md` plus the empty-phrase file matching the body language: `phrases.ja.md` for Japanese, `phrases.en.md` for English. The Plan section transferred in Phase 3 is out of scope; leave it untouched
2. If a challenge verdict / findings exist in the conversation, fold only what belongs in the body, once. The verdict and findings themselves never enter the body
3. When a plan draft exists, match the body as it stands after the preceding steps against the one plan draft you pick, per `${CLAUDE_SKILL_DIR}/references/duplication-match.md`. Pick the `/think` plan draft in the conversation when there is one, otherwise the matching file under `.claude/workspace/planning/`. Without a plan draft, skip this match

## Phase 3: Plan Transfer

Run this phase only when a /think plan draft exists; otherwise omit the section entirely. Read the newest `*.plan.md` under `.claude/workspace/planning/` matching the issue title, and transfer both the `## Plan` and `## Backlog candidates` sections into the body as-is. Format and verification are owned by /think at write-out time and by build's Load validate; do not touch the transferred content.

## Phase 4: Publishing

1. Present the issue preview. Collect any inline tentative marks into a tentative block. Add no new content, mirror what the body already carries, and omit the block at zero items. Then confirm via AskUserQuestion: "Create this issue?" When there is no `## Plan` section and the extent puts it on the build workflow, add "hold the filing and draft a plan via `/think`" as an option
2. Write the body to a temp file. Run `${CLAUDE_SKILL_DIR}/scripts/validate-issue-body.py <the skeleton chosen in Template source> <title> <body-file>` and handle errors per `${CLAUDE_SKILL_DIR}/references/validation-errors.md`. Once it exits 0, attach labels and run `gh issue create --title "<title>" --body-file <path>`. Write `<path>` as a literal absolute path, not a variable. The hook cannot expand a variable, and the filing stops. Capture the issue URL from its output
3. If split was approved in Phase 1, suggest running /slice with the published epic number. Do not launch it automatically
4. For an issue that is not split, suggest the next step. Where a filed issue goes is decided by its extent: a fix confined to 1-3 files goes to `/fix <number>`; 4 or more files, or a new feature, goes to the build workflow with the number. When an issue bound for the build workflow has no Plan section, it gets a plan via `/think`, transferred by `/issue <number>`, before it is handed over, and `/qualify` inspects it before the hand-off. Launch none of them automatically

### Labels

`priority:*` is required, set to critical / high / medium / low by impact. For other labels, follow the repository's conventions.
