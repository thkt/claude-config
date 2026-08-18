---
name: slice
description: Break a plan / spec / PRD into independently-grabbable tracer-bullet vertical-slice issues and publish them to GitHub in dependency order. Each issue is one thin slice cutting through every layer. Do NOT use to file a single request (use /issue instead).
when_to_use: break plan into issues, plan to issues, spec to issues, vertical slice, tracer bullet, split into issues, slice
allowed-tools: Bash(gh:*) Bash(ugrep:*) Bash(bfs:*) Read LS Agent AskUserQuestion
model: opus
argument-hint: "[plan / spec / PRD / issue ref]"
---

# /slice - Break a plan into vertical-slice issues

Break a plan into independently-grabbable issues. Each issue is a tracer bullet, a thin slice cutting end-to-end through every layer (schema / API / UI / test), demoable or verifiable on its own.

## Input

Take the plan source from `$ARGUMENTS`. For an issue reference given as a number, URL, or path, fetch the body and comments via `gh issue view <N>`. If empty, work from a plan already in conversation context; if none, ask what to break down via AskUserQuestion.

## Where the published issues go next

A sliced issue carries no `## Plan` yet, so handing it straight to `/build` stops as no-plan. Generate a plan for each slice via `/think` and append it to the issue as a `## Plan` section before handing it to `/build`; use `/code` when you already hold a structured plan.

## Phase 1: Explore the codebase (optional)

If not yet explored, understand the current state. Issue titles / descriptions follow the project glossary and respect DRs in the area you touch. Look for prefactor opportunities that make the change easier. Spawn one Explore agent only when a cross-cutting sweep is needed; no per-slice spawns.

## Phase 2: Draft vertical slices

Split the plan into tracer-bullet issues. Vertical slices (through all layers), not horizontal (one layer only). Describe each slice by its end-to-end behavior, not by per-layer implementation steps. Leave out concrete file paths and code snippets: they go stale fast and mislead whoever picks the slice up. The exception is a state machine, reducer, schema, or type snippet a prototype produced, where it encodes the decision more precisely than prose; note it came from the prototype and trim it to the part that carries the decision. Write acceptance criteria that are demoable or verifiable on the slice alone; a criterion presupposing another slice's completion is a dependency and moves to Blocked by.

| Rule            | Content                                                        |
| --------------- | -------------------------------------------------------------- |
| All layers      | Each slice cuts through every layer (schema / API / UI / test) |
| Self-verifiable | A completed slice is demoable or verifiable on its own         |
| Prefactor first | If prefactoring is needed, put it in the first slice           |

### Coverage check

After drafting, enumerate the plan's requirement units, meaning user stories / acceptance criteria / FR-equivalents, and extract the units assigned to no slice. Weigh misses over false alarms; include doubtful units among the uncovered. Surface the uncovered units in what Phase 3 presents.

## Phase 3: Quiz the user

Present the proposed breakdown as a numbered list, then add one Uncovered line at the end; write "none" when nothing is uncovered. After presenting, ask: is the granularity neither too coarse nor too fine, are the dependencies correct, should any slices be merged or split, and how to handle the uncovered units. The handling options are assigning to an existing slice, a new slice, or deliberate exclusion with a reason. Iterate until the user approves. The fields to show per slice are below.

| Field        | Content                                         |
| ------------ | ----------------------------------------------- |
| Title        | Short descriptive name                          |
| Blocked by   | Which other slices must complete first (if any) |
| User stories | Which user stories this slice covers (if any)   |

## Phase 4: Publish the issues

After approval, confirm once more via AskUserQuestion before batch publish: "Create these N issues?". Creating N issues is outward-facing and hard to unwind, so never auto-publish without confirmation.

On approval, publish in dependency order with blockers first. Create blockers first and capture their numbers so "Blocked by" can reference real issue numbers. Per issue, use the skeleton chosen by Template selection below, write the body to a temp file, and file it with `gh issue create --title "<title>" --body-file <path>`. Multi-line markdown breaks through `--body`, so use `--body-file`. Write `<path>` as a literal absolute path, not a variable. The hook cannot expand a variable, and the filing stops. Do not attach a triage label; AFK consumer wiring is out of scope. Do not close or modify any parent issue. After publishing, list the created issues in dependency order, each line carrying its issue number and its blocker's number; write "none" when a slice has no blocker.

### Template selection

Enumerate `.md` files via `gh api "repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE" --jq '.[].name'`. Take the feature-equivalent template if one exists, or the only template if there is exactly one, and strip its leading `name`, `about`, `labels`, and `title` frontmatter to get the skeleton. With no candidate, use ${CLAUDE_SKILL_DIR}/../issue/templates/feature.md.

Whichever skeleton wins, add `## Parent` at the top and `## Blocked by` at the bottom. Drop the optional sections that do not apply. Confidence marking does not apply: Phase 3 already had the user approve granularity and dependencies, so a published slice carries no open decisions.

## Language

Read `language` from `~/.claude/settings.json` and translate the issue body into that language. Default to English if unset. Keep technical terms / code / identifiers untranslated.

## Error Handling

| Error                  | Action                                           |
| ---------------------- | ------------------------------------------------ |
| Issue ref unresolvable | Report the ref and stop                          |
| No git repository      | Report "Not a git repo"                          |
| gh auth failure        | Report the auth error                            |
| Publish fails midway   | Report created numbers and ask whether to resume |
