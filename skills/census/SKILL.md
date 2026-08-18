---
name: census
description: Discover design decisions that exist in code but have no DR, and produce a DR promotion candidate list ranked by impact and reversibility. Pairs with adrift, which scans existing DRs for drift against code.
when_to_use: 判断未記録の発掘, undocumented decisions, DR候補発掘, ADR候補発掘, 設計判断棚卸し, decision archaeology, design rationale audit
allowed-tools: Read Write LS Bash(date:*) Bash(python3:*) Bash(ugrep:*) Bash(git:*) Task AskUserQuestion
model: opus
argument-hint: "[file or directory]"
---

# /census - DR gap audit

## Input

`$ARGUMENTS` is an optional path naming the audit scope. What gets collected is set by the Phase 1 table. When scoped to a path, record the target in the report Summary's Scope row.

## Criteria

Every criterion lives in ${CLAUDE_SKILL_DIR}/references/decision-criteria.md. That file holds impact / reversibility, the incomplete-contract definition, the DR-worth rule of thumb, and the challenge angles.

## Phase 1: Collect

List source by running ${CLAUDE_SKILL_DIR}/scripts/list-source-files.py with python3. Scan for docs using the file patterns in ${CLAUDE_SKILL_DIR}/references/detection-targets.md. When source exceeds the guideline of 20, confirm narrowing via AskUserQuestion before the Phase 2 reviewer fan-out. Options are a subdirectory, top-N, or a specific module. Where each stream looks is set by the table below.

| $ARGUMENTS  | source          | doc                   |
| ----------- | --------------- | --------------------- |
| none        | repository root | top-level and `docs/` |
| a directory | that path       | that subtree          |
| a file      | that file alone | nothing               |

## Phase 2: Mine

Record findings under the table columns in ${CLAUDE_SKILL_DIR}/templates/report-template.md, Source File Decisions for source and Prose Document Decisions for docs. Evidence is a comment, a name, a module-doc, or a commit, and a commit-derived one reads `commit <sha>`.

### Step 1: From source

Two streams feed this step, the code itself and the git history. Census runs `git log --follow --format='%h %s' -- <file>` over the history once and extracts commits containing decision verbs. The decision verb list is in ${CLAUDE_SKILL_DIR}/references/detection-targets.md. For the code, spawn the reviewer subagent matching each source file's language via Task and have it answer the following.

- Why does this file have this granularity and shape
- Does it carry invariants or contracts unreadable from the code
- Is there a comment or module-doc recording the rationale
- Does it match the `incomplete-contract` pattern, where a comment states only the present state and omits the rule for future contributors

### Step 2: From docs

For each detected document, find sentences containing decision verbs; each match is a candidate.

## Phase 3: DR cross-reference

Cross-reference every Phase 2 candidate against the existing DRs. Drop the covered ones and record the excluded count in the Summary as "DR-covered (excluded)". The cross-reference runs when a DR directory exists; without one, every candidate moves on to Phase 4 unchanged.

## Phase 4: Judge

### Step 1: Tagging and initial ranking

Assign impact and reversibility to each candidate. Read the table top to bottom and take the first row that matches to decide whether it is promoted.

| Condition                                          | Treatment                            |
| -------------------------------------------------- | ------------------------------------ |
| `incomplete-contract=Yes`                          | Promote, whatever `documented?` says |
| `(impact = H) AND (reversibility = low OR medium)` | Promote                              |
| Anything else                                      | Record it, but do not promote        |

### Step 2: Devil's Advocate Challenge

1. Spawn `critic-design` via Task with the initial promotion candidate list and ${CLAUDE_SKILL_DIR}/references/decision-criteria.md
2. Take the verdict (confirmed / weakened / needs_revision) and weaknesses the agent returns. Its own definition decides what comes back
3. Match those weaknesses against each candidate and assign keep / downgrade / drop from the table in the criteria file
4. Record the assignment alongside the initial ranking

## Phase 5: Emit the report

Write into `docs/audit/`, naming the file with the output of `date -u +%Y-%m-%d-%H%M%S` followed by `-dr-gaps.md`. UTC keeps same-day reruns from colliding.

1. Write it following ${CLAUDE_SKILL_DIR}/templates/report-template.md, substituting placeholders from findings
2. Put a single repo-wide summary line `keep N / downgrade N / drop N` right before the DR Promotion Candidates table
3. Print the candidate count and the DR promotion candidate count to the console

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
