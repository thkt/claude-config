---
status: "accepted"
date: "2026-08-26"
decision-makers: thkt
scope: [meta, infrastructure]
---

# Track research reports in git while the rest of the workspace stays untracked

## Context and Problem Statement

`.claude/workspace/` is excluded from tracking by `.gitignore`, and the 34 research reports under `.claude/workspace/research/` exist only on the machine that wrote them. scribe reads three input kinds (merged PRs, closed issues, research reports) behind one cursor, the mergedAt of the last merged scribe PR (#531 の前提、`skills/scribe/SKILL.md` Phase 2)。

Moving scribe execution to GitHub Actions (#531) breaks this arrangement. A CI run cannot see the untracked reports, yet its merged scribe PR advances the shared cursor. Every report whose timestamp falls behind that cursor drops out of scope for later local runs too, and nothing re-reads it. The research input starves silently.

## Decision Drivers

- The cursor stays one line of truth. Splitting cursors per input kind makes every PR and issue get read once per cursor, and breaks Phase 1's single open-PR check
- CI and local runs see the same inputs, so the run result does not depend on which machine ran it
- Research knowledge keeps flowing into the wiki. Dropping research from scope would cut the third input off entirely
- The repository is public. Whatever gets tracked becomes readable by anyone

## Considered Options

- Track `.claude/workspace/research/` and keep the rest of the workspace untracked (chosen)
- Keep research untracked and hold its cursor in a local file inside the research directory
- Drop research from scribe's scope

## Decision Outcome

Chosen option: "Track `.claude/workspace/research/` and keep the rest of the workspace untracked", because it keeps the cursor single and makes CI and local runs symmetric, at the cost of publishing the reports.

The local-cursor option keeps reports private but leaves the two run kinds asymmetric: a CI run and a local run produce different pages from the same repository state, and the difference is invisible from the PR. Dropping research from scope starves the wiki of the input that motivated research reports in the first place.

git does not preserve mtime, so tracking alone is not enough: a CI checkout stamps every file with checkout time, and the `-newermt` scan reads all reports as new on every run. The research scan moves from mtime to last-commit time, with untracked (not yet committed) reports always in scope (#531 U-002).

`planning/` and the other workspace directories stay untracked. They are session-local working state, not run input.

### Consequences

- Good, because one cursor covers all three input kinds on any machine
- Good, because a research report becomes reviewable in the PR that adds it
- Bad, because research reports are published in a public repository. Each report passes human review before merge
- Bad, because `.gitignore` gains a nested negation chain (`workspace/` is ignored globally, research is re-included), which is fragile to reordering. A check-ignore test pins it (#531 U-001)

### Confirmation

`skills/scribe/tests/research_tracking_test.py` asserts `git check-ignore` exits nonzero for research files and keeps ignoring `planning/`. Reassessment triggers: research reports gain content that cannot be public, or the workspace layout changes.
