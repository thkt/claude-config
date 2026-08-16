---
status: "accepted"
date: 2026-04-20
decision-makers: thkt
---

# Normalize findings in audit multi-run aggregation with line and category tolerance

## Context and Problem Statement

Audit multi-run aggregation (introduced in commit b3ee9a6 with `--runs=N`) used strict `(file:line, category, reviewer)` as dedup key. Empirical verification on tally `HEAD~1..HEAD` with reviewer-readability × 2 runs showed only 1 of 30 findings merged (3% aggregation rate). Observed drift sources between runs:

- `file`: reviewer emits `src/collector/claude_code.rs` in run 1 but `claude_code.rs` in run 2
- `line`: point (`165`) vs range (`107-113`) with slight boundary shifts
- `category`: `structure/waste` vs `readability/complexity` for the same underlying issue

Without normalization, nearly every finding appears unique across runs, defeating the point of multi-run.

## Decision Drivers

- Measured aggregation rate (3% strict) was far below useful threshold
- Reviewers are non-deterministic LLMs; path format and category labeling vary across runs
- Integrator layer (team-integration / enhancer-evidence, ADR 0035) uses `file:line:category` dedup with severity preservation - aggregation before integrator must not destroy category information
- Drift magnitude exceeded initial estimate: diagnostic showed 50%, verification showed 87%

## Considered Options

### A: Keep strict `(file:line, category, reviewer)` key

- Good: Simple, no normalization logic
- Bad: 3% aggregation, multi-run adds cost without reducing drift noise

### B: Normalize + line-range tolerance ±3, keep category prefix in key

Normalize `file` to repo-relative path, `line` to `(start, end)` tuple, `category` to prefix before `/`. Merge key: `(file, category_prefix, reviewer)` with line overlap ±3.

- Good: Empirical 33% aggregation rate (10× strict), preserves category semantics for integrator
- Good: Tolerance is bounded - no fuzzy matching explosion
- Bad: Remaining 67% drift includes same-location-different-category findings (e.g., `:165 structure` vs `:165 readability`)

### C: Drop category from merge key entirely

Merge key: `(file, reviewer)` with line overlap only. Store `categories_observed` as union.

- Good: Would lift aggregation to ~47% (estimated from 2-run data)
- Bad: Loses category signal; integrator's `file:line:category` dedup (ADR 0035) would receive unclassified input
- Bad: Conflicts with integrator layer assumption; coordinated change across multiple specs

## Decision Outcome

Adopted option B. The additional normalization logic is justified by the 10× improvement in aggregation rate and the preservation of category semantics required by the integrator layer. Option A was empirically too lossy. Option C was rejected because it would force category re-derivation at the integrator layer, violating the responsibility split established in ADR 0035.

### Positive Consequences

- Multi-run aggregation delivers measurable deduplication (33%) on real Rust target
- Integrator layer continues to receive category-tagged findings unchanged
- Normalization rules are bounded and testable: path, line tuple, category prefix

### Negative Consequences

- Same-location-different-category drift (~67% residual) is not merged - treated as drift signal
- Normalization step adds ~20 lines to audit SKILL.md (EN/JA)
- Aggregator must parse `M-N` line range format and apply ±3 tolerance - small implementation complexity

## Implementation

Already landed in commit 7ace4ac (2026-04-20):

- `skills/audit/SKILL.md` Aggregation subsection (new)
- `.ja/skills/audit/SKILL.md` Aggregation subsection (new)
- Input section clarifies `$1` split requirement (scope vs options)

Leader applies normalization before merge key comparison. `runs_observed` integer array unions on merge. Message divergence preserves longest + optional `messages: [...]` array.

## Quality Attributes

| Attribute     | Priority | Approach                                                  |
| ------------- | -------- | --------------------------------------------------------- |
| Observability | High     | `runs_observed` tracks which runs produced each finding   |
| Correctness   | High     | Category prefix preserved for integrator compatibility    |
| Simplicity    | Medium   | Tolerance is a single parameter (±3), not a fuzzy matcher |

## Trade-offs

- Aggregation rate (33%) vs false merge risk (low, because category prefix stays in key)
- Normalization cost (small per-finding loop) vs clarity of runs_observed trail

## Reassessment Triggers

- If aggregation rate drops below 20% on a future diagnostic → reconsider Option C (category drop)
- If category drift within same (file, reviewer, line ±3) exceeds 50% of unmerged pairs → add `category_drift_observed` flag (delta § next-session pending)
- If line tolerance ±3 produces false merges in verified test → tighten to ±1 or require range overlap only

## References

- ADR 0035 - audit/verify convergence signal and reconciliation ownership
- commit b3ee9a6 - initial multi-run policy
- commit 7ace4ac - normalization + $1 split implementation
- workspace/delta/diagnostic-3run-summary.md - drift observation data
