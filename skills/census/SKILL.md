---
name: census
description: Discover design decisions that exist in code but have no DR, and produce a DR promotion candidate list ranked by impact and reversibility. Pairs with adrift, which scans existing DRs for drift against code.
when_to_use: 判断未記録の発掘, undocumented decisions, DR候補発掘, ADR候補発掘, 設計判断棚卸し, decision archaeology, design rationale audit
allowed-tools: Read Write LS Bash(date:*) Bash(python3:*) Bash(ugrep:*) Bash(git:*) Agent AskUserQuestion
model: opus
argument-hint: "[file or directory]"
---

# /census - DR gap audit

Every criterion lives in ${CLAUDE_SKILL_DIR}/references/decision-criteria.md: impact / reversibility, the incomplete-contract definition, the DR-worth rule of thumb, the challenge angles, and the verdict mapping.

## Input

`$ARGUMENTS` is an optional path naming the audit scope. The table below sets what gets collected. When scoped to a path, record the target in the report Summary's Scope row.

| $ARGUMENTS  | source          | doc                   |
| ----------- | --------------- | --------------------- |
| none        | repository root | top-level and `docs/` |
| a directory | that path       | that subtree          |
| a file      | that file alone | nothing               |

## Phase 1: Collect

1. Run `python3 ${CLAUDE_SKILL_DIR}/scripts/list-source-files.py <source>` to list source. Exit code 3 means the count exceeds the script's `SOURCE_CAP`. Narrow to a subdirectory, top-N, or one module via AskUserQuestion before Phase 2
2. Find docs by the file patterns in ${CLAUDE_SKILL_DIR}/references/detection-targets.md

## Phase 2: Mine

Record findings under the table columns in ${CLAUDE_SKILL_DIR}/templates/report-template.md, Source File Decisions for source and Prose Document Decisions for docs. Leave the Impact and Reversibility columns empty; tagging fills them. Evidence is a comment, a name, a module-doc, or a commit, and a commit-derived one reads `commit <sha>`.

### Step 1: From source

1. Per file, run `git log --follow --format='%h %s' -- <file>` and take the commits containing a decision verb from ${CLAUDE_SKILL_DIR}/references/detection-targets.md as candidates
2. Per file, spawn a general-purpose Agent with the file path and the criteria file's incomplete-contract section, and have it answer the four questions below

- Why does this file have this granularity and shape
- Does it carry invariants or contracts unreadable from the code
- Is there a comment or module-doc recording the rationale
- Does it match incomplete-contract, where a comment states only the present state and omits the rule for future contributors

### Step 2: From docs

In each detected document, search with ugrep for sentences containing a decision verb; each match is a candidate.

## Phase 3: DR cross-reference

When the DR directory exists (`<git-root>/docs/decisions/`, or `DR_DIR` when set), cross-reference every Phase 2 candidate against it. Drop the covered ones and record the count in the Summary as "DR-covered (excluded)". Without the directory, every candidate moves on to Phase 4 unchanged.

## Phase 4: Judge

### Step 1: Tagging and initial ranking

Assign impact and reversibility to each candidate, then read the table top to bottom and take the first row that matches to decide promotion.

| Condition                                          | Treatment                            |
| -------------------------------------------------- | ------------------------------------ |
| `incomplete-contract=Yes`                          | Promote, whatever `documented?` says |
| `(impact = H) AND (reversibility = low OR medium)` | Promote                              |
| Anything else                                      | Record it, but do not promote        |

### Step 2: Devil's Advocate Challenge

Per promotion candidate, spawn `critic-design` via Agent with that candidate and ${CLAUDE_SKILL_DIR}/references/decision-criteria.md. Map the verdict it returns (confirmed / weakened / needs_revision) and its weaknesses to keep / downgrade / drop with the criteria file's mapping table. Record the result alongside the initial ranking.

## Phase 5: Emit the report

1. Write into `docs/audit/`, naming the file with the output of `date -u +%Y-%m-%d-%H%M%S` followed by `-dr-gaps.md`. UTC keeps same-day reruns from colliding
2. Substitute the placeholders in ${CLAUDE_SKILL_DIR}/templates/report-template.md from the findings
3. Put the tally line `keep N / downgrade N / drop N` right before the DR Promotion Candidates table
4. Print the candidate count and the DR promotion candidate count to the console

## Handoff

- File `keep` via `/dr`, or fold them into a single tracking issue via `/issue`
- List `downgrade` as comment-strengthening tasks
- Record `drop` in the report with nothing following
- The drift scan against existing DRs goes to `/adrift`. In a repository that already has DRs, run it first and use this skill for the gaps drift cannot reach
- Code changes and README updates are out of scope

## Completion condition

Finish only when all of the following hold. Record the reason in the report for any that cannot.

| Item        | Condition                                                           |
| ----------- | ------------------------------------------------------------------- |
| Report      | `docs/audit/<YYYY-MM-DD>-<HHMMSS>-dr-gaps.md` exists                |
| Source file | Every reviewed file is accounted for                                |
| Document    | Every scanned document has an extraction section                    |
| Evidence    | Every finding carries an Evidence entry                             |
| Tags        | Every candidate has impact + reversibility                          |
| Candidates  | DR promotion candidates listed at the end with a one-line rationale |
