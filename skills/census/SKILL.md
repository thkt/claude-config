---
name: census
description: Discover design decisions that exist in code but have no DR, and produce a DR promotion candidate list ranked by impact and reversibility. Pairs with adrift, which scans existing DRs for drift against code.
when_to_use: 判断未記録の発掘, undocumented decisions, DR候補発掘, ADR候補発掘, 設計判断棚卸し, decision archaeology, design rationale audit
allowed-tools: Read Write LS Bash(mkdir:*) Bash(date:*) Bash(python3:*) Bash(ugrep:*) Bash(git:*) Task AskUserQuestion
model: opus
argument-hint: "[file or directory]"
---

# /census - DR gap audit

## Input

`$ARGUMENTS` is an optional path naming the audit scope. No argument means the whole repository, a file path mines that file alone, and a directory path limits the scope to that subtree. When scoped to a path, record the target in the report Summary's Scope row.

## Criteria

Impact / reversibility, the incomplete-contract definition, the DR-worth rule of thumb, and the challenge angles all live in ${CLAUDE_SKILL_DIR}/references/decision-criteria.md.

## Phase 1: Collect

Gather two streams, source and doc. When a file is named directly, that one file is the whole source stream and no docs are collected.

| Stream | How to gather                                                                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| source | Run ${CLAUDE_SKILL_DIR}/scripts/list-source-files.py with python3. Pass the directory when one is given, the repository root when no argument is passed                    |
| doc    | Scan for the file patterns in ${CLAUDE_SKILL_DIR}/references/detection-targets.md. With a directory target, scope to that subtree; with no argument, top-level and `docs/` |

When source exceeds the guideline of 20, confirm narrowing via AskUserQuestion before the Phase 2 reviewer fan-out. Options are a subdirectory, top-N, or a specific module. At or below the guideline, skip the prompt.

## Phase 2: Mine

Record each finding as `file:line` + decision summary + evidence + `documented?` + `incomplete-contract?`. Evidence is a comment, a name, a module-doc, or a commit; a commit-derived one reads `commit <sha>`.

### Step 1: From source

For each source file, spawn the reviewer subagent matching its language via Task. The reviewer answers the following.

- Why does this file have this granularity and shape
- Does it carry invariants or contracts unreadable from the code
- Is there a comment or module-doc recording the rationale
- Does it match the `incomplete-contract` pattern, where a comment states only the present state and omits the rule for future contributors

The reviewer has no git access, so census itself runs `git log --follow --format='%h %s' -- <file>` and extracts commits containing decision verbs. The decision verb list is in ${CLAUDE_SKILL_DIR}/references/detection-targets.md.

### Step 2: From docs

For each detected document, find sentences containing decision verbs; each match is a candidate.

## Phase 3: DR cross-reference

When a DR directory exists, cross-reference every Phase 2 candidate against the existing DRs. Drop the covered ones and record the excluded count in the Summary as "DR-covered (excluded)". With no DR directory, every candidate moves on to Phase 4.

## Phase 4: Judge

### Step 1: Tagging and initial ranking

Assign impact and reversibility to each candidate. A DR promotion candidate satisfies `(impact = H) AND (reversibility = low OR medium)`.

A finding with `incomplete-contract=Yes` is promoted whatever `documented?` says. Every other finding is recorded but not promoted.

### Step 2: Devil's Advocate Challenge

Spawn `critic-design` via Task with the initial promotion candidate list and ${CLAUDE_SKILL_DIR}/references/decision-criteria.md. The agent returns what its own definition specifies: verdict (confirmed / weakened / needs_revision) and weaknesses. `/census` matches those weaknesses against each candidate and assigns keep / downgrade / drop from the table in that criteria file. Record the assignment alongside the initial ranking.

## Phase 5: Emit the report

Write the report following ${CLAUDE_SKILL_DIR}/templates/report-template.md, substituting placeholders from findings. Put a single repo-wide summary line `keep N / downgrade N / drop N` right before the DR Promotion Candidates table. After writing, print the candidate count and the DR promotion candidate count to the console.

```bash
mkdir -p docs/audit
STAMP=$(date -u +%Y-%m-%d-%H%M%S)  # UTC date + HHMMSS; same-day reruns never collide
REPORT="docs/audit/${STAMP}-dr-gaps.md"
```

## Handoff

- Show only the post-challenge `keep` candidates, and file each via `/dr` or fold them into a single tracking issue via `/issue`
- List `downgrade` candidates as comment-strengthening tasks. `drop` candidates are recorded in the report and carried no further
- DR drafting goes to `/dr` and the drift scan against existing DRs to `/adrift`. Code changes and README updates are out of scope
- In a repository that already has DRs, run `/adrift` first and use this skill for the gaps drift cannot reach

## Completion condition

Finish only when all of the following hold. Record the reason in the report for any that cannot.

| Item        | Condition                                                           |
| ----------- | ------------------------------------------------------------------- |
| Report      | `docs/audit/<YYYY-MM-DD>-<HHMMSS>-dr-gaps.md` exists                |
| Source file | Every reviewed file is accounted for                                |
| Document    | Every scanned document has an extraction section                    |
| Tags        | Every candidate has impact + reversibility                          |
| Candidates  | DR promotion candidates listed at the end with a one-line rationale |
