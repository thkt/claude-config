---
name: scribe
description: Extract recurring patterns from past closed PRs/issues and the research findings in .claude/workspace/research/, verify them against the latest code, and propose them to docs/wiki/ via PR.
when_to_use: scribe 実行, wiki 抽出, 共通項の蒸留, PR/issue からの知見蓄積, research 成果の蓄積, run scribe, wiki extraction, distill recurring patterns
allowed-tools: Bash(git:*) Bash(gh:*) Bash(find:*) Bash(python3:*) Read Write Edit LS
---

# /scribe - Accumulate PR / issue / research recurring patterns into the wiki

The patterns worth picking up are procedures that recur as a routine or a convention, and review comments or failures that recur. A one-off circumstance and a design decision itself are not picked up.

## Invariants

| Condition                 | Content                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Via PR                    | Never commit or push directly to the default branch                                                                                                            |
| Progress record           | The cursor is the mergedAt of the last merged scribe PR. For a research file, compare that mergedAt against its mtime                                          |
| Where the threshold lives | `scripts/triage.py` decides whether a pattern becomes a page or a candidate; this skill does not judge it                                                      |
| Facts only                | Write only facts stated in PRs / issues and research files, plus facts verified in the current code. No guessing                                               |
| No research paths         | Never write `.claude/workspace/research/` file paths under `docs/wiki/`. workspace is untracked, so a wiki reader cannot follow one                            |
| Worktree isolation        | Edit and commit inside an isolated worktree; never touch the user's working tree. The worktree is created in Phase 6, so Phase 6 is the only Phase that writes |

## Phase 1: Preconditions and onboarding

1. Check for an unmerged scribe PR with `gh pr list --label scribe --state open --limit 1`. If one exists, do not overtake it; stop and report
2. Prepare the content of ${CLAUDE_SKILL_DIR}/templates/readme.md when `docs/wiki/README.md` does not exist
3. Prepare the content of ${CLAUDE_SKILL_DIR}/templates/candidates.md when `docs/wiki/_candidates.md` does not exist. For this and step 2 alike, the write happens inside Phase 6's worktree
4. If the scribe label does not exist, create it with `gh label create scribe --description "scribe による wiki 提案"`

## Phase 2: Scope

1. Get the mergedAt of the last merged scribe PR with `gh pr list --label scribe --state merged --limit 1 --json mergedAt -q '.[0].mergedAt'`
2. If no mergedAt comes back, this is the first run. Take all of `gh pr list --state merged --search '-label:scribe'`, `gh issue list --state closed`, and `find .claude/workspace/research -name '*.md'` as the scope
3. If a mergedAt comes back, take the PRs from `gh pr list --state merged --search "-label:scribe merged:><mergedAt>"`, the issues from `gh issue list --state closed --search "closed:><mergedAt>"`, and the files from `find .claude/workspace/research -name '*.md' -newermt "<mergedAt>"` as the scope
4. Only `*.md` counts as a research target; read no other format. Use mtime as the cursor, not the `Generated:` line inside a file. `Generated:` carries the date the file was produced and stays there through later edits, so it drops updates
5. Even with PRs, issues, and research all empty, go on to Phase 3 when `docs/wiki/_candidates.md` holds a line with two or more pieces of evidence. Report "nothing new" and stop only when that line is absent too

## Phase 3: Extraction

1. Read `docs/wiki/*.md` to grasp the existing pages. A page carrying `kind: structure` is not a pattern, so a coinciding name stays `existing: "none"`
2. Read each in-scope PR/issue including comments via `gh pr view <number> --comments`/`gh issue view <number> --comments`
3. Read each in-scope research file in full with Read. Do not narrow by section name
4. Add what you read to the array, grouped per pattern. Add only the evidence when the pattern is in the array already. Design decisions and their history belong to `docs/decisions/` and are out of scope
5. Read `docs/wiki/_candidates.md`. When a pattern in the array points at the same thing as an existing candidate line, use that line's body verbatim as the `name`
6. Pass that array to `python3 ${CLAUDE_SKILL_DIR}/scripts/triage.py '<JSON array of patterns>' docs/wiki/_candidates.md`. The script reads the candidate lines from both sections of `_candidates.md` into the array, then applies the two-evidence threshold and the per-run page cap, splitting the result into `pages` (create/promote/update), `candidates`, and `deferred` (left for a later run). Do not judge the threshold or the cap yourself
7. Prepare how `docs/wiki/_candidates.md` changes. `candidates` go under the 単発 section and `deferred` under the 昇格待ち section, and the line of a pattern that became a page is removed. A line takes the form `- <one-line content> <evidence>`, with `#number` and `(research)` listed space-separated. When the line is already there, add only the evidence. The write happens inside Phase 6's worktree

| Field      | Value                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `name`     | The key deciding whether two patterns are the same. One from a candidate line carries that line's body verbatim |
| `evidence` | The array of evidence. `#number` from a PR/issue, `(research)` from a research file                             |
| `existing` | `page` when it sits on an existing page, `candidate` when in `_candidates.md`, else `none`                      |

## Phase 4: Cross-check against the latest code

Before creating, promoting, or updating a page, cross-check each pattern against the current code. What this Phase settles is the content; writing to files happens inside Phase 6's worktree, all at once.

1. For each item that holds, add the current-code location as reference code, written as `path` + symbol name. Write no line numbers
2. Settle the globs of the implementation files the rule bears on. Only a rule that arrives during implementation carries globs; one confined to filing or PR practice carries an empty array
3. Sweep the reference code of every page under `docs/wiki/*.md`, existing pages unrelated to this run's scope included. Mechanically verify that the file exists and that the symbol name greps within it
4. For a broken reference, reread the current code. The table below settles what to write
5. When a dropped item holds a line in `_candidates.md`, move that line into the 棄却 section and write the reason it was dropped on the next line, indented. This takes priority over the removal Phase 3 step 7 prepared

| Check                                                         | What to settle when it fails                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Does the convention/procedure still hold in the current code? | Drop it. On an existing page, the wording that marks it as no longer holding |
| Does a structure page match the current implementation?       | The wording that matches the current code. Do not drop it                    |
| Is it already mechanically enforced by lint / hook / CI?      | Drop it                                                                      |
| Do the referenced paths/commands still exist?                 | The relink target among the current paths/commands                           |

## Phase 5: 由来 link judgment

For a page being created, promoted, or updated, write the DR file path in its 由来 section only when the pattern derives from a specific DR decision under `docs/decisions/`. The gate is the counterfactual test "if that DR were superseded, would this page need rewriting?", and the link is added only on Yes. With three or more links on one page, reapply the counterfactual test to each link and remove those that come back No.

In addition, inspect the 由来 links of every page, including existing pages. Verify the DR file exists and check its status; if superseded, read the successor DR. Settle the relink target as the successor when the pattern still holds, and settle the wording that marks it as no longer holding when it does not. Here too, the write happens inside Phase 6's worktree。

## Phase 6: PR creation

Move only the pages in Phase 3's `pages`, and state `deferred` in the PR body as what was left. Reference repairs and 由来 repairs sit outside the cap, so run them even when `pages` is empty. Create a PR even for candidate-only additions, and skip the PR only when there is no change at all.

1. After `git fetch origin <default branch>`, create an isolated worktree and branch `scribe/<yyyymmdd-HHMMSS>` from `origin/<default branch>`
2. Write what Phase 3-5 settled, inside the worktree. Pages follow the skeleton in ${CLAUDE_SKILL_DIR}/templates/page.md, candidate lines go to `_candidates.md` in Phase 3 step 7's form, and the reference and 由来 repairs use the relink targets Phase 4-5 settled
3. Commit the elements of `commits` in order, one at a time. The first commit also `git add`s the `_candidates.md` update and the reference/由来 repairs alongside its own pages, and the rest of the elements `git add` only their own pages. Commit each element separately with the message `docs(wiki): <that element's pattern names, ...> を追加/更新`
4. Run `python3 ${CLAUDE_SKILL_DIR}/scripts/verify_run.py <worktree> <start-count> <expected-commits> <base>`. `<start-count>` is the 昇格待ち row count before the write, `<expected-commits>` is the element count of `commits`, `<base>` is the `origin/<default branch>` step 1 branched from, and confirm `ok` comes back true. On false, do not go on to step 5
5. Push and run `gh pr create --base <default branch>`. Title `[scribe] <pattern names, ...> を追加/更新`, label scribe. In the body, list the added/promoted/updated pages grouped per commit, then the candidate additions, the reference-repaired/由来-repaired pages, the range of PRs/issues read and the count of research files read, the items dropped by verification, and any leftovers
6. Remove the worktree
7. When step 4 returns false, leave the worktree in place so the write can be redone. When step 5 or later fails, run `git worktree remove --force <worktree>` and `git branch -D scribe/<yyyymmdd-HHMMSS>` so neither the worktree nor the local branch is left behind
