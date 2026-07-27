---
name: qualify
description: Inspect whether an issue is in shape to hand to build, returning a verdict (build-ready / needs-plan / needs-fix) and the findings. Do NOT use to file an issue (use /issue) or to screen a PR (use /preview).
when_to_use: qualify issue, check issue before build, build-ready verdict, issue quality check, issue検分, build投入可否
allowed-tools: Bash(gh issue view:*) Bash(ugrep:*) Read AskUserQuestion
model: opus
argument-hint: "[issue number or URL]"
---

# /qualify - Inspect an issue for build readiness

Inspect an issue before handing it to build, and return whether to hand it over or fix it first. The conditions that stop build at Load live in build.js, so read them at run time instead of copying them into this skill. Findings come back as question drafts for the author; nothing is posted to GitHub.

## Input

`$ARGUMENTS` is an issue number or URL. If empty, ask for the target via AskUserQuestion.

## Phase 1: Fetch

Take the body and labels with `gh issue view <ref> --json number,title,body,labels`. If the fetch fails, report the ref and stop.

## Phase 2: Inspect the plan contract

With no `## Plan` section, set the verdict to needs-plan and go to Phase 4 without inspecting further. Build stops as no-plan anyway, so no other finding changes the decision to hand it over.

With a `## Plan` section, apply build.js's own conditions. Read them at run time rather than transcribing them.

1. Locate them with `ugrep -n "const validate = |const UNIT_CAPS = |const oversizedUnits = " ~/.claude/workflows/build.js`
2. Read the places it hits
3. Apply what you read to the issue's Plan section and list the violations

Treat every violation of those conditions as a blocker. Build stops on the same conditions, so none of them degrade to advice.

### Id cross-check

Build compares the U-NNN / T-NNN id sets in the body against the extraction by exact match. qualify does not extract, so check instead that the body's own ids are unique and consecutive. Duplicates and gaps are blockers.

| Collected from                    | Target |
| --------------------------------- | ------ |
| Lines starting with `### U-NNN`   | unit   |
| `T-NNN` right after a list marker | test   |

## Phase 3: Inspect the format

Check that the issue follows `/issue`'s output format. A violation here does not stop build, so treat it as advice. The one exception is unverifiable acceptance criteria, which is a blocker: nobody can judge whether the implementation is right, and build's conformance check loses what it compares against.

| Axis                | Passing condition                                                             | Severity |
| ------------------- | ----------------------------------------------------------------------------- | -------- |
| Title type          | Starts with one of `[Feature]` / `[Bug]` / `[Docs]` / `[Chore]`               | advice   |
| What & Why          | States whose pain it is and the evidence for it                               | advice   |
| Verifiable criteria | Each item states an observable result whose judgment does not rest on opinion | blocker  |
| tentative marks     | Undecided judgments carry `(tentative: <action at pickup>)`                   | advice   |
| priority label      | One of `priority:critical` / `high` / `medium` / `low` is attached            | advice   |

## Phase 4: Verdict and output

Evaluate the verdicts top to bottom and take the first one that matches.

| Verdict     | Condition            | Next step                                                             |
| ----------- | -------------------- | --------------------------------------------------------------------- |
| needs-plan  | No `## Plan` section | Draft a plan via `/think` and transfer it via `/issue` into `## Plan` |
| needs-fix   | 1 or more blockers   | Return the findings to the author, then run `/qualify` again          |
| build-ready | 0 blockers           | Hand the issue number to the build workflow                           |

Return the output in conversation. The order is the verdict on one line, the blockers, the advice, then the question drafts. Write "none" for a section with 0 entries.

### Question drafts

Turn a finding into a question only when the author alone can answer it, which covers gaps in the spec and undecided judgments; for a format defect, write the correction directly instead of asking. Attach the answer you expect to each question as a hypothesis. The author corrects the hypothesis instead of explaining from scratch, and your level of understanding shows at the same time.

Do not post. Whether to send them to the author, and in what words, is the human's call.

## Rules

| Rule               | Content                                                                             |
| ------------------ | ----------------------------------------------------------------------------------- |
| Never post         | Do not post a comment to GitHub. The output goes to the conversation                |
| One at a time      | Bulk triage is out of scope. One invocation inspects one issue                      |
| No source lookup   | Whether the preconditions exist in code is left to build's Revalidate stage         |
| No priority ruling | Only whether a priority label is attached. Do not judge which value is right        |
| Never transcribe   | Read the build-stopping conditions from build.js at run time; do not copy them here |
