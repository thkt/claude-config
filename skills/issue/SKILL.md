---
name: issue
description: Generate GitHub Issue with structured title and body. Standalone; requires no upstream stage. When challenge / research artifacts exist in the conversation, they feed the body's evidence; when a /think plan draft exists, it is transferred into the `## Plan` section.
when_to_use: Issue作って, Issue書いて, Issue作成, GitHub Issue, prepare for build
allowed-tools: Bash(gh:*) Bash(cat:*) Bash(ugrep:*) Read AskUserQuestion
model: opus
argument-hint: "[issue description]"
---

# /issue - GitHub Issue Generator

A standalone issue-creation skill. When `/challenge` / `/research` / `/think` artifacts exist in the conversation context, use them: the `/challenge` verdict for the posting judgment, `/research` findings as the body's evidence, and `/think`'s plan draft transferred into the `## Plan` section. The human decides which stages an issue goes through.

## Input

`$ARGUMENTS` is the issue description. If empty, prompt for it via AskUserQuestion.

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

A bug meeting all three criteria below is minor, and handling it directly via /fix without filing is an option. When filing anyway, add a footer note to the body, "minor; may be handled via /fix". An intermittent bug with the root cause unidentified does not qualify.

| Criterion     | Content                                   |
| ------------- | ----------------------------------------- |
| Change extent | Fits within 1 file                        |
| Reproduction  | The reproduction steps are settled        |
| Investigation | No cross-codebase investigation is needed |

### Why wall-bouncing

Establish the issue's Why before drafting the body. One question per message, attaching the answer you expect as the hypothesis in the recommended option. Questions the codebase can answer are explored via Read / ugrep before asking. Once the three points below are readable from the description, or you can predict the answers to the questions you would ask next, stop asking and move to drafting.

| Question                                    | Where it lands in the body |
| ------------------------------------------- | -------------------------- |
| Who needs this?                             | What & Why                 |
| What pain exists, and what is the evidence? | What & Why                 |
| What measurable result counts as success?   | Acceptance Criteria        |

### Template source

List `.md` files via `gh api "repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE" --jq '.[].name'`. If a GitHub template whose filename or `name` contains the type exists, read its body and strip the leading frontmatter fields `name` / `about` / `labels` / `title` for the skeleton. Otherwise use `templates/<type>.md` directly under the skill directory.

### Confidence marking

Requirements the user decided stay unmarked. Add an inline `(tentative: <action at pickup>)` only to decisions the user left open and facts not yet verified. The marker is build's extraction keyword, so it stays `tentative` whatever language the body is written in. Issue-level premises that attach to no specific line go in the Premises section on feature and bug, which have one; on chore and docs, which do not, use inline tentative marks alone. build extracts tentative marks as assumptions and surfaces them on the draft PR as veto targets the user can overturn. Do not write an uncertain HOW at all.

### Split assessment

When two or more criteria are each independently implementable, ask via AskUserQuestion whether to split, offering "keep as one issue" or "split into an epic and child issues". Do not count fine-grained checks that only verify one deliverable; they stay within one issue. Never auto-split, since publishing N issues is hard to unwind. On approval, publish this issue as the epic and run the rest of the flow unchanged on it.

## Phase 2: Refinement

1. Refine the body inline against `${CLAUDE_SKILL_DIR}/references/prose-review.md` plus the empty-phrase file matching the body language: `phrases.ja.md` for Japanese, `phrases.en.md` for English. The Plan section transferred in Phase 3 is out of scope; leave it untouched
2. If a challenge verdict / findings exist in the conversation, fold only what belongs in the body, once. The verdict and findings themselves never enter the body
3. When a plan draft exists, match the body as it stands after the preceding steps against the one plan draft you pick, per the Duplication match below. Pick the `/think` plan draft in the conversation when there is one, otherwise the matching file under `.claude/workspace/planning/`. Without a plan draft, skip this match

### Duplication match

The target is every place the body and `## Plan` carry the same knowledge. Two places carry the same knowledge when editing one forces the other to change; what can change independently stays in both. Replace the duplicated body side with a `## Plan` reference. Even after the replacement, one line that states what change that heading covers, the rejection reason, its file:line grounds, and the pain description stay in the body. The reference runs from the body to `## Plan`. `/think` writes the plan out to a standalone file that predates the body, and the body's sections come into existence after it. When they conflict, treat the plan as the source of truth and correct the body. Acceptance Criteria overlaps Outcome as well, and it stays in the body because it drives the human merge call and never reaches build.

| Body section      | Plan counterpart |
| ----------------- | ---------------- |
| Approach          | unit contract    |
| Testing Decisions | T-NNN            |
| Premises          | Preconditions    |
| Scope, In scope   | files            |

## Phase 3: Plan Transfer

Run this phase only when a /think plan draft exists; otherwise omit the section entirely. Read the newest `*.plan.md` under `.claude/workspace/planning/` matching the issue title, and transfer both the `## Plan` and `## Backlog candidates` sections into the body as-is. Format and verification are owned by /think at write-out time and by build's Load validate; do not touch the transferred content.

## Phase 4: Publishing

1. Present the issue preview. Collect any inline tentative marks into a tentative block. Add no new content, mirror what the body already carries, and omit the block at zero items. Then confirm via AskUserQuestion: "Create this issue?"
2. Write the body to a temp file, attach labels, and run `gh issue create --title "<title>" --body-file <path>`. Capture the issue URL from its output
3. If split was approved in Phase 1, suggest running /slice with the published epic number. Do not launch it automatically
4. For an issue that is not split, suggest the next step. A fix confined to 1-3 files goes to `/fix <number>`; 4 or more files, or a new feature, goes to the build workflow with the number. Build stops as no-plan without a `## Plan` section, so an issue that has none gets a plan via `/think`, transferred by this skill, before it is handed over. `/qualify` inspects it before the hand-off. Launch none of them automatically

### Labels

`priority:*` is required, set to critical / high / medium / low by impact. For other labels, follow the repository's conventions.
