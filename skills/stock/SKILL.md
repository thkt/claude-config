---
name: stock
description: Generates and presents a typed report classifying each row of docs/REFERENCE_INDEX.md as dangling-path/no-match/unsupported/unreferenced via a deterministic script. Proposes ranked, capped index candidates from the unreferenced docs, confirms the per-row accept/reject decision with a human, and writes the accepted rows into the index.
when_to_use: REFERENCE_INDEX drift check, index drift detection, unindexed docs discovery, reference index check, index candidate proposal, dangling reference detection
allowed-tools: Read Bash(node:*) Bash(git:*) AskUserQuestion
argument-hint: "[index path]"
---

# /stock - REFERENCE_INDEX drift detection and index candidate proposal

Writing to the index is limited to appending accepted rows; existing rows are never modified.

## Input

The repo-relative path of the index file under audit comes in as `$ARGUMENTS`. Empty means `docs/REFERENCE_INDEX.md`. The row format is authoritative at `${CLAUDE_SKILL_DIR}/references/reference-index-format.md`, which defines the 3 columns glob, description, and path, the meaning of a `-` row, and the supported glob subset. Read it once before applying Phase 2 and later.

## Phase 1: Run the script

Run `node ${CLAUDE_SKILL_DIR}/scripts/check-index.js <repo root> <index path>`. Pass any path inside the repository (usually `.`) as `<repo root>`, and the index file's path as `<index path>`. The script matches each index row against the tracked-file list from `git ls-files` and returns JSON on stdout carrying dangling, noMatch, unsupported, unreferenced, size, and exitCode.

## Phase 2: Present the report

Present the Phase 1 JSON as a table per category. When dangling rows exist, state fixing the index side (correct the path or delete the row) as the priority task. When `found` is false the index does not exist yet and there is nothing to drift-check; say so and move on to Phase 3.

| Category     | Meaning                                                                                                                                        | Severity                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| dangling     | The path column's referenced target does not exist                                                                                             | Error (the direct cause of a non-zero exitCode) |
| noMatch      | The glob column matches no tracked file                                                                                                        | Warning                                         |
| unsupported  | The glob column falls outside the supported character set (reference-index-format.md § Supported glob subset), or contains a bare `**`         | Warning                                         |
| unreferenced | An md under `docs/` not referenced by any row's path column. Decision records, READMEs, and `_`-prefixed files are excluded as non-conventions | Input to Phase 3                                |
| size         | The index table's line count (surrounding prose is not counted) and whether it exceeds the one-screen threshold (30 lines, DR-0091)            | Warning only when the threshold is exceeded     |

## Phase 3: Propose candidates

For each docs path in unreferenced, build an index candidate in the following order.

1. Infer a candidate glob. From the directory name holding the doc, guess the source-side directory it likely corresponds to. For example `docs/conventions/component-tsx.md` yields a same-name prefix such as `src/**/*.tsx`. A doc matching no source directory name, and a doc cutting across multiple domains, are routed to 3
2. Rank the docs that yielded a candidate glob. The count of tracked files that glob matches is the rank score. A higher match count means a more concrete correspondence between the doc and the code, so present the top 10 by rank descending as a candidate table. The table carries the 3 columns glob, description, and path, matching the row format in reference-index-format.md. Beyond 10, state only the excess count in one line. When the target doc count exceeds 20, confirm the narrowing target (by directory, top N, etc.) via AskUserQuestion before presenting the candidate table
3. A doc for which 1 found no source-side directory correspondence is excluded from the candidate table and listed separately as manual-addition recommended, carrying only the path and the reason. Never propose a row with `-` written in the glob column, because a `-` row requires human judgment outside glob matching, as reference-index-format.md § Meaning of a `-` row defines

## Phase 4: Write the accepted rows

Once the candidate table is presented, confirm the accept/reject decision per row via AskUserQuestion. With zero accepted rows, finish without writing anything.

With accepted rows, run `node ${CLAUDE_SKILL_DIR}/scripts/check-index.js --apply <index path> '<JSON array of accepted rows>'`. Each JSON element is a `{glob, description, path}` matching the candidate table's 3 columns, and an absent index is created with its header. The header is not hand-written because unless it is exactly 2 lines the parser eats one data row or picks up the separator row as a ghost row.

After writing, run `node ${CLAUDE_SKILL_DIR}/scripts/check-index.js <repo root> <index path>` once more, confirm the written rows land in neither dangling nor noMatch, and report the result.

## Handoff

- Rows on the manual-addition-recommended list and `-` rows are written into the index by the human directly
- Fixing dangling, noMatch, and unsupported is out of scope. Whether to correct the path or drop the row is a judgment about intent, so like validating individual candidates it is left to `/fix` or direct editing

## Completion condition

Do not finish until all are satisfied. State the reason for any item that cannot be satisfied.

| Item                        | Condition                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Report                      | All categories dangling, noMatch, unsupported, unreferenced, and size are presented                     |
| Candidate table             | Docs from unreferenced for which a candidate glob was inferred, presented rank-descending, capped at 10 |
| Manual-addition recommended | Docs for which no candidate glob was inferred, listed with a reason and without a `-` row               |
| Acceptance check            | Confirmed the accept/reject decision for each candidate row via AskUserQuestion                         |
| Write                       | Wrote the accepted rows into the index and re-checked that they do not land in drift                    |
