---
name: stock
description: Generates and presents a typed report classifying each row of docs/REFERENCE_INDEX.md as dangling-path/no-match/unsupported/unreferenced via a deterministic script. Proposes ranked, capped index candidates from the unreferenced docs and leaves the per-row accept/reject decision to a human.
when_to_use: REFERENCE_INDEX drift check, index drift detection, unindexed docs discovery, reference index check, index candidate proposal, dangling reference detection
allowed-tools: Read Bash(node:*) Bash(git:*) AskUserQuestion
argument-hint: "[index path]"
---

# /stock - REFERENCE_INDEX drift detection and index candidate proposal

## Input

`$ARGUMENTS` is the repo-relative path of the index file under audit. When omitted, use `docs/REFERENCE_INDEX.md`. The row format (the 3 columns glob/description/path, the meaning of a `-` row, the supported glob subset) is authoritative at ${CLAUDE_SKILL_DIR}/references/reference-index-format.md. Read it once before reading the judgments below.

## Phase 1: Run the script

Run `node ${CLAUDE_SKILL_DIR}/scripts/check-index.js <repo root> <index path>`. Pass any path inside the repository (usually `.`) as `<repo root>`, and the index file's absolute or relative path settled in the Input section as `<index path>`. The script matches each index row against the tracked-file list from `git ls-files` and returns JSON on stdout carrying `dangling`/`noMatch`/`unsupported`/`unreferenced`/`size`/`exitCode`.

## Phase 2: Present the report

Present the Phase 1 JSON as a table per category.

| Category     | Meaning                                                                                                                                                              | Severity                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| dangling     | The path column's referenced target does not exist                                                                                                                   | Error (the direct cause of a non-zero exitCode) |
| noMatch      | The glob column matches no tracked file                                                                                                                              | Warning                                         |
| unsupported  | The glob column falls outside the supported character set (${CLAUDE_SKILL_DIR}/references/reference-index-format.md's Supported glob subset) or contains a bare `**` | Warning                                         |
| unreferenced | An md under `docs/` not referenced by any row's path column                                                                                                          | Input to Phase 3                                |
| size         | The index table's line count (surrounding prose is not counted) and whether it exceeds the one-screen threshold (30 lines, ADR-0091)                                 | Warning only when the threshold is exceeded     |

When `exitCode` is non-zero, state explicitly that at least one dangling row exists. A dangling row points at a file that does not exist, so present fixing the index side (correct the path or delete the row) as the priority task.

## Phase 3: Propose candidates

For each docs path in unreferenced, build an index candidate through the steps below.

### 3a Infer a candidate glob

From the directory name holding the unreferenced doc, infer a source-side directory it likely corresponds to (e.g. `docs/conventions/component-tsx.md` suggests a same-name prefix such as `src/**/*.tsx`). A doc with no corresponding source-side directory (no source directory name matches, or it cuts across multiple domains) is routed to 3b instead.

### 3b Rank and cap

For each doc that yielded a candidate glob in 3a, use the count of tracked files that glob matches as the rank score (a higher match count means a more concrete correspondence between the doc and the code, ranking it higher). Sort by rank descending and present the top 10 as a candidate table (the 3 columns glob/description/path, matching the row format in ${CLAUDE_SKILL_DIR}/references/reference-index-format.md). Beyond 10, state only the excess count in one line and make no individual proposal for the 11th and beyond. When the target doc count exceeds 20, confirm the narrowing target (by directory, top N, etc.) via AskUserQuestion before presenting the candidate table.

### 3c Never propose a `-` row

A doc for which 3a found no source-side directory correspondence is excluded from the candidate table. List it separately as "manual-addition recommended" with only the path and the reason no correspondence was found, and never propose a row with `-` written in the glob column. A `-` row requires human judgment outside glob matching per ${CLAUDE_SKILL_DIR}/references/reference-index-format.md, so leave the addition itself to human manual work.

## Handoff

- Present the candidate table (3b) and the manual-addition-recommended list (3c) to the human; the accept/reject decision is made per row by the human. An accepted row is reflected into `docs/REFERENCE_INDEX.md` by the human as an addition
- dangling/noMatch/unsupported are presented only as fix tasks on the index side; this skill itself never rewrites the index
- Validating individual candidates and actually adding a `-` row are out of scope. Out-of-scope work is left to `/fix` or direct editing

## Completion condition

Finish only when all of the following are satisfied. State the reason for any item that cannot be satisfied.

| Item                        | Condition                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Report                      | All categories dangling/noMatch/unsupported/unreferenced/size are presented                             |
| Candidate table             | Docs from unreferenced for which a candidate glob was inferred, presented rank-descending, capped at 10 |
| Manual-addition recommended | Docs for which no candidate glob was inferred, listed with a reason and without a `-` row               |
| Handoff                     | States explicitly that the accept/reject decision is left to the human's per-row judgment               |
