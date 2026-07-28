---
name: stock
description: Generates and presents a typed report classifying each row of docs/REFERENCE_INDEX.md as dangling-path/no-match/unsupported/unreferenced via a deterministic script. Proposes ranked, capped index candidates from the unreferenced docs and leaves the per-row accept/reject decision to a human.
when_to_use: REFERENCE_INDEX drift check, index drift detection, unindexed docs discovery, reference index check, index candidate proposal, dangling reference detection
allowed-tools: Read Bash(node:*) Bash(git:*) AskUserQuestion
argument-hint: "[index path]"
---

# /stock - REFERENCE_INDEX drift detection and index candidate proposal

Verify each index row and propose index candidates from the unindexed docs. No index rewriting.

## Input

The repo-relative path of the index file under audit comes in as `$ARGUMENTS`. Empty means `docs/REFERENCE_INDEX.md`. The row format is authoritative at `${CLAUDE_SKILL_DIR}/references/reference-index-format.md`, which defines the 3 columns glob, description, and path, the meaning of a `-` row, and the supported glob subset. Read it once before applying Phase 2 and later.

## Phase 1: Run the script

Run `node ${CLAUDE_SKILL_DIR}/scripts/check-index.js <repo root> <index path>`. Pass any path inside the repository (usually `.`) as `<repo root>`, and the index file's absolute or relative path settled in Input as `<index path>`. The script matches each index row against the tracked-file list from `git ls-files` and returns JSON on stdout carrying dangling, noMatch, unsupported, unreferenced, size, and exitCode.

## Phase 2: Present the report

Present the Phase 1 JSON as a table per category. When dangling rows exist, state fixing the index side (correct the path or delete the row) as the priority task.

| Category     | Meaning                                                                                                                                | Severity                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| dangling     | The path column's referenced target does not exist                                                                                     | Error (the direct cause of a non-zero exitCode) |
| noMatch      | The glob column matches no tracked file                                                                                                | Warning                                         |
| unsupported  | The glob column falls outside the supported character set (reference-index-format.md § Supported glob subset), or contains a bare `**` | Warning                                         |
| unreferenced | An md under `docs/` not referenced by any row's path column                                                                            | Input to Phase 3                                |
| size         | The index table's line count (surrounding prose is not counted) and whether it exceeds the one-screen threshold (30 lines, ADR-0091)   | Warning only when the threshold is exceeded     |

## Phase 3: Propose candidates

For each docs path in unreferenced, build an index candidate in the following order.

1. Infer a candidate glob. From the directory name holding the doc, guess the source-side directory it likely corresponds to. For example `docs/conventions/component-tsx.md` yields a same-name prefix such as `src/**/*.tsx`. A doc matching no source directory name, and a doc cutting across multiple domains, are routed to 3
2. Rank the docs that yielded a candidate glob. The count of tracked files that glob matches is the rank score, and a higher match count means a more concrete correspondence between the doc and the code, ranking it higher. Present the top 10 by rank descending as a candidate table. The table carries the 3 columns glob, description, and path, matching the row format in `${CLAUDE_SKILL_DIR}/references/reference-index-format.md`. Beyond 10, state only the excess count in one line. When the target doc count exceeds 20, confirm the narrowing target (by directory, top N, etc.) via AskUserQuestion before presenting the candidate table
3. A doc for which 1 found no source-side directory correspondence is excluded from the candidate table and listed separately as manual-addition recommended, carrying only the path and the reason. Never propose a row with `-` written in the glob column. A `-` row requires human judgment outside glob matching, as `${CLAUDE_SKILL_DIR}/references/reference-index-format.md` § Meaning of a `-` row defines, so leave the addition itself to human manual work

## Handoff

- Present the candidate table and the manual-addition-recommended list; the accept/reject decision is made per row by the human
- This skill never rewrites the index. Adding accepted rows and fixing dangling, noMatch, and unsupported stay human work, and validating individual candidates is out of scope, left to `/fix` or direct editing

## Completion condition

Do not finish until all are satisfied. State the reason for any item that cannot be satisfied.

| Item                        | Condition                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Report                      | All categories dangling, noMatch, unsupported, unreferenced, and size are presented                     |
| Candidate table             | Docs from unreferenced for which a candidate glob was inferred, presented rank-descending, capped at 10 |
| Manual-addition recommended | Docs for which no candidate glob was inferred, listed with a reason and without a `-` row               |
| Handoff                     | States explicitly that the accept/reject decision is left to the human's per-row judgment               |
