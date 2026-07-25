---
name: scribe
description: Extract recurring patterns from past closed PRs/issues and the research findings in workspace/research/, verify them against the latest code, and propose them to docs/wiki/ via PR.
when_to_use: scribe 実行, wiki 抽出, 共通項の蒸留, PR/issue からの知見蓄積, research 成果の蓄積, run scribe, wiki extraction, distill recurring patterns
allowed-tools: Bash(git:*) Bash(gh:*) Bash(find:*) Read Write Edit LS
---

# /scribe - Accumulate PR / issue / research recurring patterns into the wiki

Extract the common patterns that recur across this repository's past merged PRs / closed issues and the research findings in `workspace/research/`, namely routine procedures / conventions and recurring review comments / failure patterns, verify them against the latest code, and accumulate them into `docs/wiki/`. Always propose via PR.

## Invariants

| Condition              | Content                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Via PR                 | Never commit or push directly to the default branch                                                                                              |
| Progress record        | The cursor is the mergedAt of the last merged scribe PR. For a research file, compare that mergedAt against its mtime                            |
| Threshold of 2         | A pattern with fewer than 2 pieces of evidence goes to `docs/wiki/_candidates.md`, not a page. One research file counts as one piece of evidence |
| Facts only             | Write only facts stated in PRs / issues and research files, plus facts verified in the current code. No guessing                                 |
| Reference traceability | Never write `workspace/research/` file paths under `docs/wiki/`                                                                                  |
| Worktree isolation     | Edit and commit inside an isolated worktree; never touch the user's working tree                                                                 |

## Phase 1: Preconditions and onboarding

1. Check for an unmerged scribe PR with `gh pr list --label scribe --state open --limit 1`. If one exists, do not overtake it; stop and report
2. If `docs/wiki/README.md` does not exist, create it from the template in `${CLAUDE_SKILL_DIR}/templates/readme.md` and include it in the upcoming PR
3. If the scribe label does not exist, create it with `gh label create scribe --description "scribe による wiki 提案"`

## Phase 2: Scope

1. Get the mergedAt of the last merged scribe PR with `gh pr list --label scribe --state merged --limit 1 --json mergedAt -q '.[0].mergedAt'`
2. If no mergedAt comes back, this is the first run. Take all of `gh pr list --state merged --search '-label:scribe'`, `gh issue list --state closed`, and `find workspace/research -name '*.md'` as the scope
3. If a mergedAt comes back, take the PRs from `gh pr list --state merged --search "-label:scribe merged:><mergedAt>"`, the issues from `gh issue list --state closed --search "closed:><mergedAt>"`, and the files from `find workspace/research -name '*.md' -newermt "<mergedAt>"` as the scope
4. Only `*.md` counts as a research target; read no other format. Do not use the `Generated:` line inside a file as the cursor
5. If PRs, issues, and research are all empty, report "nothing new" and stop

## Phase 3: Extraction

1. Read `docs/wiki/*.md` and `docs/wiki/_candidates.md` to grasp existing pages / candidates
2. Read each in-scope PR / issue including comments via `gh pr view <number> --comments` / `gh issue view <number> --comments`
3. Read each in-scope research file in full with Read. Do not narrow by section name
4. Triage what you read with this table. Design decisions and their history belong to `docs/decisions/` and are out of scope

Write evidence as `#number` when it comes from a PR / issue, and as `(research)` when it comes from a research file.

| Match                             | Operation                                                |
| --------------------------------- | -------------------------------------------------------- |
| Pattern on an existing page       | Append the evidence; update content if it changed        |
| Second evidence for a candidate   | Promote to a page and remove the candidate line          |
| A recurring sign matching nothing | Append "one-line content + evidence" to `_candidates.md` |
| One-off circumstance              | Do not write                                             |

## Phase 4: Cross-check against the latest code

Before creating, promoting, or updating a page, cross-check each pattern against the current code. For each item that holds, add the current-code location as reference code, written as `path` + symbol name (no line numbers), and list the items dropped by verification in the PR body of `§ Phase 6: PR creation`.

| Check                                                         | When it fails                                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Does the convention/procedure still hold in the current code? | Do not write it. If it is on an existing page, update it as no longer holding |
| Is it already mechanically enforced by lint / hook / CI?      | Do not write it                                                               |
| Do the referenced paths/commands still exist?                 | Rewrite with the current paths/commands                                       |

In addition, sweep the reference code of every page under `docs/wiki/*.md`, including existing pages unrelated to this run's scope. Mechanically verify that the file exists and that the symbol name greps within the file, and for a broken reference, reread the current code and relink it. If the pattern itself no longer holds because its referent is gone, update the page as no longer holding.

## Phase 5: 由来 link judgment

For a page being created, promoted, or updated, write the DR file path in its 由来 section only when the pattern derives from a specific DR decision under `docs/decisions/`. The gate is the counterfactual test "if that DR were superseded, would this page need rewriting?", and the link is added only on Yes. With three or more links on one page, reapply the counterfactual test to each link and remove those that come back No.

In addition, sweep the 由来 links of every page, including existing pages. Verify the DR file exists and check its status; if superseded, read the successor DR, relink 由来 to the successor when the pattern still holds, and update the page as no longer holding when it does not。

## Phase 6: PR creation

The cap is 3 pages per run, counted as promotions + updates combined; edits to `_candidates.md`, reference repairs from `§ Phase 4: Cross-check against the latest code`, and 由来 repairs from `§ Phase 5: 由来 link judgment` do not count. Beyond the cap, prioritize by evidence count and state the leftovers in the PR body. If there is no change at all, do not create a PR. Create a PR even for candidate-only additions.

1. After `git fetch origin <default branch>`, create an isolated worktree and branch `scribe/<yyyymmdd-HHMMSS>` from `origin/<default branch>`
2. Edit `docs/wiki/` inside the worktree following the skeleton in `${CLAUDE_SKILL_DIR}/templates/page.md`, and commit with the message `docs(wiki): <pattern names, ...> を追加/更新`
3. Push and run `gh pr create --base <default branch>`. Title `[scribe] <pattern names, ...> を追加/更新`, label scribe
4. In the body, write the added/promoted/updated pages, candidate additions, reference-repaired / 由来-repaired pages, the range of PRs / issues read and the count of research files read, the items dropped by verification, and any leftovers
5. Remove the worktree
