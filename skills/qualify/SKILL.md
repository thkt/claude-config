---
name: qualify
description: Inspect whether an issue is in shape to hand to build, returning a verdict (build-ready / needs-plan / needs-fix / needs-split) and the findings. Do NOT use to file an issue (use /issue) or to match a PR against its plan (use /preview).
when_to_use: 実装可否, build-ready 判定, issue 品質チェック, qualify issue, check issue before build
allowed-tools: Bash(gh issue view:*) Bash(gh repo view:*) Bash(ugrep:*) Bash(bfs:*) Read AskUserQuestion
model: opus
argument-hint: "[issue number or URL]"
---

# /qualify - Inspect an issue for build readiness

Inspect an issue before handing it to build, and return whether to hand it over or fix it first. The conditions that stop build at Load live in build.js, so read them from there at run time. Findings that need a decision come back to the user as questions with a hypothesis attached.

## Input

`$ARGUMENTS` is an issue number or URL. If empty, ask for the target via AskUserQuestion.

## Phase 1: Fetch

Take the body and labels with `gh issue view <ref> --json number,title,body,labels,url`. If the fetch fails, report the ref and stop. Take the local repository with `gh repo view --json nameWithOwner` and match it against the owner/repo in the url.

## Phase 2: Inspect the plan contract

With no `## Plan` section, set the verdict to needs-plan, inspect Verifiable criteria alone among Phase 3's axes, and go to Phase 4. A plan-less issue carries no contract, so Creation collision and Displayed field enumeration have nothing to judge against. The remaining axes are advice, so they leave the next step as it is. Criteria sent on to `/think` while unverifiable become what the plan gets designed against.

Under needs-plan the decision to pick it up does not change, while the next step depends on the issue's content. When the acceptance criteria are unverifiable, set the next step to "rewrite the criteria as verifiable before drafting the plan". When the title is `[Bug]` and the body states no root cause, set the next step to "pin down the root cause before drafting the plan". Write both when both apply, and keep "draft the plan" when neither does.

With a `## Plan` section, read build.js's own conditions at run time, apply them, and treat every violation as a blocker. Build stops on the same conditions, so every severity stays blocker. Carrying the inspection on without reading those conditions leaves the output unable to separate no violation from conditions never applied.

1. Locate them by running ugrep over ${CLAUDE_SKILL_DIR}/../../workflows/build.js for the lines matching `const validate = |const UNIT_CAPS = |const oversizedUnits = `. When any of them goes unmatched, report the anchor you could not read and stop
2. Read the places it hits
3. Apply what you read to the issue's Plan section and list the violations

### Id cross-check

Build compares the U-NNN and T-NNN id sets in the body against the extraction by exact match. qualify's inspection covers the body alone, so check that the body's own ids are unique. Collect the ids from lines starting with `### U-NNN` and from a `T-NNN` right after a list marker. Duplicates are blockers. A gap is not among the conditions that stop build, so it goes uninspected.

## Phase 3: Inspect the format and the premises

Check that the issue follows `/issue`'s output format and that the plan's premises still match the current code. Inspect exactly the axes in the table below. When acceptance criteria are unverifiable, nobody can judge whether the implementation is right and build's conformance check loses what it compares against. "Errors are announced to screen readers" passes; "the UX improves" does not. When a file marked for creation already exists, no build stage looks at it before overwriting. The Revalidate stage owns the verdict on whether preconditions exist, so the check here lands as advice that forecasts where build would stop.

When Phase 1's match finds the owner/repo differ, leave Preconditions exist and Creation collision uninspected. The local code is not what the issue targets, so applying them reads an existing file as absent and an absent file as present. An axis left uninspected goes into the advice along with why.

| Axis                        | Passing condition                                                                                                                                                                                        | Severity |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Title type                  | Starts with one of `[Feature]` / `[Bug]` / `[Docs]` / `[Chore]`                                                                                                                                          | advice   |
| What & Why                  | States whose pain it is and the evidence for it                                                                                                                                                          | advice   |
| Verifiable criteria         | Each item states an observable result an outside observer can judge                                                                                                                                      | blocker  |
| priority label              | One of `priority:critical` / `high` / `medium` / `low` is attached                                                                                                                                       | advice   |
| Preconditions exist         | Each {path, pattern} is found in the current code                                                                                                                                                        | advice   |
| Creation collision          | Files whose contract reads as new do not exist yet                                                                                                                                                       | blocker  |
| Displayed field enumeration | When an issue adds or changes a displayed domain field, it enumerates that field or cites an agent-readable source. A missing enumeration's finding names the AC and the plan's T-NNN as the destination | blocker  |
| Need for a split            | The plan's size stays within the Task Decomposition thresholds in `rules/core/PREFLIGHT.md`                                                                                                              | split    |

### Counting the need for a split

Severity `split` does not stop build. It goes on neither the blocker list nor the advice list, and moves the verdict alone. Apply it only when a `## Plan` section is there, and skip the axis when it is not.

The thresholds come from PREFLIGHT's Task Decomposition, of whose four rows only the two that can be evaluated here are used. Lines has no source in a plan. Layers needs the layer names settled, and qualify has no step that settles them, so there is nothing to count against. Put the two rows left out in the advice list with that reason.

| What is counted | How it is counted                                                                                                                      | Threshold |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Files           | Collect every unit's files and count by responsibility. A file and its `.ja/` mirror count as one, as do a change and its tests        | ≥5        |
| Features        | The number of unit groups sharing no files with each other. A seam unit crosses everything by definition, so it counts toward no group | ≥3        |

This is not the same question `/issue`'s split assessment asked. That one runs before the body is written, so it never saw a plan, and what it counted were the criteria raised from the description. What is counted here is the plan's files and units, which did not exist when `/issue` decided. It is not a declined suggestion raised twice.

## Phase 4: Verdict and output

Return the output in conversation. Write the text in the order the verdict on one line, the blockers, then the advice, and raise the questions after it via AskUserQuestion. Write "none" for a section with 0 entries. Evaluate the verdicts in the table below top to bottom and take the first one that matches. The table's value is the default next step; when Phase 2 settled a different next step from the issue type, that one replaces it.

| Verdict     | Condition              | Next step                                                       |
| ----------- | ---------------------- | --------------------------------------------------------------- |
| needs-plan  | No `## Plan` section   | Draft a plan via `/think` and transfer it via `/issue <number>` |
| needs-fix   | 1 or more blockers     | Clear the blockers, then run `/qualify` again                   |
| needs-split | Over a split threshold | Cut it into vertical slices via `/slice <number>`               |
| build-ready | 0 blockers             | Hand the issue number to the build workflow                     |

### Questions

Turn a finding into a question when reading the body alone does not settle it, which covers gaps in the spec and undecided judgments. A format defect comes back as the correction written out directly.

Raise one question per finding, and put the answer you expect first among the options as the hypothesis. Word each option as an action the user decides on, not as an operation qualify performs. Use multiSelect only when one finding's options are not mutually exclusive. With 5 or more findings that need a decision, put the 4 most severe into AskUserQuestion and list the rest as question text with its hypothesis.

Return the answers you get as a proposal for what in the body to rewrite and how. qualify never rewrites the body, so that proposal is the route by which an answer reaches it. Add the answer to the next-step line as well.

With 0 findings that need a decision, make no AskUserQuestion call and place no questions section. Under needs-plan, turn only the Verifiable criteria finding into a question. Drafting the plan is already settled, so any other answer does not change what happens at pickup.

## Rules

| Rule                         | Content                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Result destination           | The inspection's result goes to the conversation, and GitHub sees only issue reads                                                                    |
| One at a time                | One invocation inspects one issue                                                                                                                     |
| The body owns the verdict    | The verdict comes from the issue body as fetched. After a question gets an answer the verdict holds its value, and the answer goes into the next step |
| Build owns the call          | Revalidate owns the verdict on whether preconditions exist; this check forecasts                                                                      |
| Priority presence only       | Look only at whether a priority label is attached                                                                                                     |
| build.js owns the conditions | Read the build-stopping conditions from build.js at run time. The conditions live there only                                                          |
