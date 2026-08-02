---
name: qualify
description: Inspect whether an issue is in shape to hand to build, returning a verdict (build-ready / needs-plan / needs-fix) and the findings. Do NOT use to file an issue (use /issue) or to screen a PR (use /preview).
when_to_use: 実装可否, build-ready 判定, issue 品質チェック, qualify issue, check issue before build
allowed-tools: Bash(gh issue view:*) Bash(ugrep:*) Bash(bfs:*) Read AskUserQuestion
model: opus
argument-hint: "[issue number or URL]"
---

# /qualify - Inspect an issue for build readiness

Inspect an issue before handing it to build, and return whether to hand it over or fix it first. The conditions that stop build at Load live in build.js, so read them from there at run time. Findings that need a decision come back to the user as questions with a hypothesis attached.

## Input

`$ARGUMENTS` is an issue number or URL. If empty, ask for the target via AskUserQuestion.

## Phase 1: Fetch

Take the body and labels with `gh issue view <ref> --json number,title,body,labels`. If the fetch fails, report the ref and stop.

## Phase 2: Inspect the plan contract

With no `## Plan` section, set the verdict to needs-plan, go to Phase 4, and end the inspection there. The decision to pick it up does not change, but the next step does depend on the issue's type. When the title is `[Bug]`, check whether the body states a root cause; if not, set the next step to "pin down the root cause before drafting the plan". Other types keep "draft the plan" as the next step, so no other finding changes the decision to hand it over.

With a `## Plan` section, read build.js's own conditions at run time, apply them, and treat every violation as a blocker. Build stops on the same conditions, so every severity stays blocker.

1. Locate them with `ugrep -n "const validate = |const UNIT_CAPS = |const oversizedUnits = " ~/.claude/workflows/build.js`
2. Read the places it hits
3. Apply what you read to the issue's Plan section and list the violations

### Id cross-check

Build compares the U-NNN and T-NNN id sets in the body against the extraction by exact match. qualify's inspection covers the body alone, so check that the body's own ids are unique and consecutive. Collect the ids from lines starting with `### U-NNN` and from a `T-NNN` right after a list marker. Duplicates and gaps are blockers.

## Phase 3: Inspect the format and the premises

Check that the issue follows `/issue`'s output format and that the plan's premises still match the current code. Inspect exactly the axes in the table below. When acceptance criteria are unverifiable, nobody can judge whether the implementation is right and build's conformance check loses what it compares against. "Errors are announced to screen readers" passes; "the UX improves" does not. When a file marked for creation already exists, no build stage looks at it before overwriting. The Revalidate stage owns the verdict on whether preconditions exist, so the check here lands as advice that forecasts where build would stop.

| Axis                        | Passing condition                                                                                                                                                                                        | Severity |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Title type                  | Starts with one of `[Feature]` / `[Bug]` / `[Docs]` / `[Chore]`                                                                                                                                          | advice   |
| What & Why                  | States whose pain it is and the evidence for it                                                                                                                                                          | advice   |
| Verifiable criteria         | Each item states an observable result an outside observer can judge                                                                                                                                      | blocker  |
| tentative marks             | Undecided judgments carry `(tentative: <action at pickup>)`                                                                                                                                              | advice   |
| priority label              | One of `priority:critical` / `high` / `medium` / `low` is attached                                                                                                                                       | advice   |
| Preconditions exist         | Each {path, pattern} is found in the current code                                                                                                                                                        | advice   |
| Creation collision          | Files whose contract reads as new do not exist yet                                                                                                                                                       | blocker  |
| Displayed field enumeration | When an issue adds or changes a displayed domain field, it enumerates that field or cites an agent-readable source. A missing enumeration's finding names the AC and the plan's T-NNN as the destination | blocker  |

## Phase 4: Verdict and output

Return the output in conversation. The order is the verdict on one line, the blockers, the advice, then the questions. Write "none" for a section with 0 entries. Evaluate the verdicts in the table below top to bottom and take the first one that matches. The table's value is the default next step; when Phase 2 settled a different next step from the issue type, that one replaces it.

| Verdict     | Condition            | Next step                                                       |
| ----------- | -------------------- | --------------------------------------------------------------- |
| needs-plan  | No `## Plan` section | Draft a plan via `/think` and transfer it via `/issue <number>` |
| needs-fix   | 1 or more blockers   | Clear the blockers, then run `/qualify` again                   |
| build-ready | 0 blockers           | Hand the issue number to the build workflow                     |

### Questions

Turn a finding into a question when reading the body alone does not settle it, which covers gaps in the spec and undecided judgments. A format defect comes back as the correction written out directly. Attach the answer you expect to each question as a hypothesis, and address the questions to the user.

## Rules

| Rule                         | Content                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Result destination           | The inspection's result goes to the conversation, and GitHub sees only issue reads           |
| One at a time                | One invocation inspects one issue                                                            |
| Build owns the call          | Revalidate owns the verdict on whether preconditions exist; this check forecasts             |
| Priority presence only       | Look only at whether a priority label is attached                                            |
| build.js owns the conditions | Read the build-stopping conditions from build.js at run time. The conditions live there only |
