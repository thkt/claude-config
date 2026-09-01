---
name: slice
description: Break a plan / spec / PRD into independently-grabbable tracer-bullet vertical-slice issues and publish them to GitHub in dependency order. Each issue is one thin slice cutting through every layer. Do NOT use to file a single request (use /issue instead).
when_to_use: break plan into issues, plan to issues, spec to issues, vertical slice, tracer bullet, split into issues, slice
allowed-tools: Bash(gh:*) Bash(cat:*) Bash(python3:*) Bash(ugrep:*) Bash(bfs:*) Read LS Agent AskUserQuestion
model: opus
argument-hint: "[plan / spec / PRD / issue ref]"
---

# /slice - Break a plan into vertical-slice issues

Break a plan into independently-grabbable issues. Each issue is a tracer bullet, a thin slice cutting end-to-end through the layers this repository has, demoable or verifiable on its own. Which layers those are differs per repository: a web app has schema, API, UI, and test, while a harness or a library has an entry point, a decision, an output, and test. Settle their names in Phase 1 before cutting anything.

## Input

Take the plan source from `$ARGUMENTS`. For an issue reference given as a number, URL, or path, fetch the body and comments via `gh issue view <N>`. If empty, work from a plan already in conversation context; if none, ask what to break down via AskUserQuestion.

Check whether the source carries a `## Plan` section. When it does, the units are settled already, so distribute rather than draft. Phase 2 and where the issues go next both branch on this.

## Where the published issues go next

When the source carried a `## Plan`, every slice is published carrying one too, so hand the issue number straight to the build workflow.

When it did not, a sliced issue carries no `## Plan`, and handing it to the build workflow stops as no-plan. Take one slice at a time in the order below, starting from the one the user picks rather than driving every slice at once.

1. Draft the plan with `/think`
2. Run `/issue <number>`. The route that takes only a number is what moves that plan into the issue's `## Plan` section
3. Hand the issue number to the build workflow, with the `## Plan` section now in place from step 2

Skip step 2 and use `/code` when you already hold a structured plan.

## Phase 1: Settle the layers

Name the layers this repository has. A web app: schema, API, UI, test. A harness or a library: entry point, decision, output, test. Read them off the directory structure and the run of files one existing feature touches. When they do not read off, ask via AskUserQuestion. Every later Phase cuts by these names.

If the codebase is not yet explored, understand the current state alongside that. Issue titles / descriptions follow the project glossary and respect DRs in the area you touch. Look for prefactor opportunities that make the change easier. Spawn one Explore agent only when a cross-cutting sweep is needed; no per-slice spawns.

## Phase 2: Draft vertical slices

Split the plan into tracer-bullet issues. Vertical slices (through all layers), not horizontal (one layer only). Describe each slice by its end-to-end behavior, not by per-layer implementation steps. Leave out concrete file paths and code snippets: they go stale fast and mislead whoever picks the slice up. The exception is a state machine, reducer, schema, or type snippet a prototype produced, where it encodes the decision more precisely than prose; note it came from the prototype and trim it to the part that carries the decision. Write acceptance criteria that are demoable or verifiable on the slice alone; a criterion presupposing another slice's completion is a dependency and moves to Blocked by.

| Rule            | Content                                                |
| --------------- | ------------------------------------------------------ |
| All layers      | Each slice cuts through every layer Phase 1 settled    |
| Self-verifiable | A completed slice is demoable or verifiable on its own |
| Prefactor first | If prefactoring is needed, put it in the first slice   |

### Distributing a source that carries a plan

When the source carries a `## Plan`, decide the slices by how the units group. Build each slice's Plan per the table in ${CLAUDE_SKILL_DIR}/references/plan-distribution.md. When the plan's units are cut per layer so that distribution cannot produce a vertical slice, hand it back the way that reference settles.

### Coverage check

After drafting, enumerate the plan's requirement units, meaning user stories / acceptance criteria / FR-equivalents, and extract the units assigned to no slice. Weigh misses over false alarms; include doubtful units among the uncovered. Surface the uncovered units in what Phase 3 presents.

## Phase 3: Quiz the user

Present the proposed breakdown as a numbered list, then add one Uncovered line at the end; write "none" when nothing is uncovered. After presenting, ask: is the granularity neither too coarse nor too fine, are the dependencies correct, should any slices be merged or split, and how to handle the uncovered units. The handling options are assigning to an existing slice, a new slice, or deliberate exclusion with a reason. Iterate until the user approves. The fields to show per slice are below.

| Field        | Content                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Title        | A short name with the type bracketed in front, as in `[Feature]`. Validation requires the prefix |
| Blocked by   | Which other slices must complete first (if any)                                                  |
| User stories | Which user stories this slice covers (if any)                                                    |

## Phase 4: Publish the issues

After approval, confirm once more via AskUserQuestion before batch publish: "Create these N issues?". Creating N issues is outward-facing and hard to unwind, so never auto-publish without confirmation.

On approval, publish in dependency order with blockers first. Create blockers first and capture their numbers so "Blocked by" can reference real issue numbers.

1. Pour the body into the skeleton chosen by Template selection and write it to a temp file with a `cat` heredoc. Write `<path>` as a literal absolute path, not a variable. The hook cannot expand a variable, and the filing stops
2. Run `python3 ${CLAUDE_SKILL_DIR}/../issue/scripts/validate-issue-body.py <the skeleton file> <title> <body-file>`. Fix the errors per ${CLAUDE_SKILL_DIR}/../issue/references/validation-errors.md and rerun after fixing. N issues are filed in one batch, so one body's gap spreads across all N
3. File it with `gh issue create --title "<title>" --body-file <path> --label priority:<value>`. Multi-line markdown breaks through `--body`, so use `--body-file`. Choose priority from critical, high, medium, and low by impact, and align the label with the skeleton's priority section when it has one
4. When the source was an issue, link every slice to it with `gh issue edit <the source's number> --add-sub-issue <n1,n2,...>`. Skip this when the source was not an issue, such as a plan file
5. Attach no triage label. AFK consumer wiring is out of scope. Leave the parent issue open and its body unchanged
6. List the created issues in dependency order, each line carrying its issue number and its blocker's number. Write "none" when a slice has no blocker
7. Write the requirement units Phase 3 deliberately excluded at the end of the report, each with its reason. The parent issue's body is left unmodified, so nothing else keeps the reason

### Template selection

Take the skeleton per ${CLAUDE_SKILL_DIR}/../issue/references/template-source.md. Choosing in the same order `/issue` does keeps the body's skeleton the same whichever route filed it.

Whichever skeleton wins, add `## Parent` at the top and `## Blocked by` at the bottom. The sub-issue link step 4 makes is where the parent-child relation lives; `## Parent` is its copy, placed so a reader holding only the body still sees it. Set both in the same pass rather than one alone. Drop the optional sections that do not apply. Confidence marking does not apply: Phase 3 already had the user approve granularity and dependencies, so a published slice carries no open decisions.

## Language

Read `language` from `~/.claude/settings.json` and translate the issue body into that language. Default to English if unset. Keep technical terms / code / identifiers untranslated.

## Error Handling

| Error                  | Action                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Issue ref unresolvable | Report the ref and stop                                                                     |
| No git repository      | Report "Not a git repo"                                                                     |
| gh auth failure        | Report the auth error                                                                       |
| Publish fails midway   | Report created numbers and ask whether to resume                                            |
| Body fails validation  | Report the error you cannot fix and ask whether to skip that one and continue with the rest |
