---
name: census
description: Discover design decisions that exist in code but have no DR, and produce a DR promotion candidate list ranked by impact and reversibility. Pairs with adrift, which scans existing DRs for drift against code.
when_to_use: 判断未記録の発掘, undocumented decisions, DR候補発掘, ADR候補発掘, 設計判断棚卸し, decision archaeology, design rationale audit
allowed-tools: Read Write LS Bash(mkdir:*) Bash(date:*) Bash(python3:*) Bash(ugrep:*) Bash(git:*) Task AskUserQuestion
model: opus
argument-hint: "[file or directory]"
---

# /census - DR Gaps Audit

## Input

`$ARGUMENTS` is an optional path naming the audit scope. No argument means the whole repository, a file path mines that file alone, and a directory path limits the scope to that subtree. Skip the doc phases when the target is a single source file. When scoped to a path, record the target in the report Summary's Scope row.

## Decision Criteria

Impact / reversibility, the incomplete-contract definition, the DR-worth rule of thumb, and the challenge angles all live in `${CLAUDE_SKILL_DIR}/references/decision-criteria.md`. Each phase applies it as the basis for judgment.

## Phase 1: Source File Listing

If a file is named directly, skip this phase and pass that file to Phase 3. Otherwise run `python3 ${CLAUDE_SKILL_DIR}/scripts/list-source-files.py <scope>` to list the source files. `<scope>` is the directory when one is given, the repository root when no argument is passed.

When the file count exceeds the guideline of 20, confirm narrowing via AskUserQuestion before the Phase 3 reviewer fan-out. Adjust the guideline to repository size; options are a subdirectory, top-N, or a specific module. At or below the guideline, skip the prompt and pass the full list to Phase 3.

## Phase 2: Document Detection

Skip this phase when the target is a single source file. With a directory target, scope to that subtree; with no argument, scan top-level and `docs/`. Look for decision-bearing documents using the patterns in `${CLAUDE_SKILL_DIR}/references/detection-targets.md`.

## Phase 3: Source File Decision Mining

Gather evidence from two channels per source file. The reviewer covers code-internal evidence, census covers git history.

### 3a Reviewer mining

For each source file, spawn the reviewer subagent matching its language via Task. The reviewer answers the following.

- Why does this file have this granularity and shape?
- What invariant or contract does it carry that a reader cannot derive from the code?
- Is there a comment or module-doc that records the rationale?
- Does the comment describe only the current state and omit the rule for future contributors, matching the `incomplete-contract` pattern?

### 3b Commit message mining

The reviewer has no git access, so census itself runs `git log --follow --format='%h %s' -- <file>` and extracts commits containing decision verbs. The decision verb list is in detection-targets.md.

### 3c Recording and DR cross-reference

Record each finding as `file:line` + decision summary + evidence + `documented?` + `incomplete-contract?`. Evidence is one of comment / naming / module-doc / commit. Commit-sourced findings use `commit <sha>` as evidence. After collecting findings, cross-reference against the DR directory if any, drop findings already covered by a DR, and record the excluded count in Summary as "DR-covered (excluded)".

## Phase 4: Prose Decision Extraction

For each detected document, find sentences containing decision verbs; each match is a candidate. Cross-reference against DRs as in 3c and drop covered candidates.

## Phase 5: Ranking and Challenge

### 5a Tagging and Initial Ranking

Tag each candidate from Phase 3 and Phase 4 with impact and reversibility. DR promotion candidates satisfy `(impact = H) AND (reversibility = low OR medium)`.

Findings with `incomplete-contract=Yes` are promoted regardless of `documented?` value. Other findings are recorded but not promoted.

### 5b Devil's Advocate Challenge

Spawn `critic-design` via Task with the initial promotion candidate list and `~/.claude/skills/census/references/decision-criteria.md`. `${CLAUDE_SKILL_DIR}` does not expand inside a subagent, so hand it the absolute form. The agent returns what its own definition specifies: verdict (confirmed / weakened / needs_revision) and weaknesses. `/census` matches those weaknesses against each candidate and assigns keep / downgrade / drop from the table in decision-criteria.md. Record the assignment alongside the initial ranking.

## Phase 6: Report Output

Write the report following `${CLAUDE_SKILL_DIR}/templates/report-template.md`, substituting placeholders from findings. Put a single repo-wide summary line `keep N / downgrade N / drop N` right before the DR Promotion Candidates table. After writing, print a console summary: candidate count, DR promotion candidate count.

```bash
mkdir -p docs/audit
STAMP=$(date -u +%Y-%m-%d-%H%M%S)  # UTC date + HHMMSS; same-day reruns never collide
REPORT="docs/audit/${STAMP}-dr-gaps.md"
```

## Hand-off

- Print only the post-challenge `keep` candidates and offer `/dr` for each, or aggregate them into a single tracking issue via `/issue`
- List `downgrade` candidates as comment-strengthening tasks. Record `drop` candidates in the report only, not as follow-up
- This skill only mines and nominates. DR drafting goes to `/dr`, drift scan against existing DRs to `/adrift`, code changes and README updates are out of scope
- In a repo that already has DRs, run `/adrift` first, then use this skill to mine the gaps drift cannot see

## Completion Criteria

Finish only when all of the following hold. Record the reason for any unmet item in the report.

| Item        | Condition                                                                            |
| ----------- | ------------------------------------------------------------------------------------ |
| Report      | `docs/audit/<YYYY-MM-DD>-<HHMMSS>-dr-gaps.md` exists                                 |
| Source file | Every reviewed file is accounted for. No-decision files may be batched into one line |
| Document    | Every scanned document has an extraction section. "no decisions found" is acceptable |
| Tags        | Every candidate has impact + reversibility                                           |
| Candidates  | DR promotion candidates listed at the end with a one-line rationale                  |
