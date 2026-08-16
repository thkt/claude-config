---
status: "rejected"
date: 2026-04-20
decision-makers: thkt
---

# Reject snapshot-aware audit pipeline in favor of multi-run aggregation

## Context and Problem Statement

During audit pipeline redesign discussion (session df1eb6ca), reviewer drift between runs was split into two flavors with distinct remediation axes:

| Flavor          | Symptom                                        | Cause                       | Proposed remedy         |
| --------------- | ---------------------------------------------- | --------------------------- | ----------------------- |
| A. Stochastic   | Same input, ~40-87% different findings per run | LLM stochasticity           | Multi-run aggregation   |
| B. Accumulative | Run 2 deepens on Run 1 results                 | Prior snapshot not in input | Snapshot-aware pipeline |

Snapshot-aware pipeline was conceived as Flavor B remedy: feed prior run's findings to reviewers as input context so each successive run builds on the last rather than re-exploring from scratch.

## Decision Drivers

- Multi-run aggregation (ADR 0043) shipped as Flavor A remedy, empirically validated
- Flavor B was always positioned as supplementary (副次的) to A
- Cross-target verification now available:
  - tally (Rust): aggregation rate 33%
  - okr-dashboard (TS): aggregation rate 61.1%, category drift 8.3%
- Both results clear ADR 0043 Reassessment Triggers by wide margin

## Considered Options

### A: Implement snapshot-aware pipeline

Add persistence layer that feeds prior snapshot (file list, findings summary) to each reviewer's prompt in Run N+1.

- Good: Addresses Flavor B directly; each run deepens analysis
- Bad: Stateful pipeline - reviewer outputs become run-order dependent
- Bad: Risk of cross-run leakage (Run 2 copies Run 1 wording instead of re-reasoning)
- Bad: Observed drift is dominated by Flavor A; no evidence Flavor B is material once A is handled

### B: Reject - multi-run aggregation covers the use case

Rely on ADR 0043 normalization + tolerance for cross-run convergence. No snapshot persistence between runs.

- Good: Stateless pipeline preserved; each run is independent
- Good: Empirical aggregation rates (33% Rust, 61% TS) demonstrate adequate coverage without snapshot input
- Good: ADR 0043 already has Reassessment Triggers to detect if B's need emerges (agg < 20%, drift > 50%)
- Bad: Intentional deep-dive across runs is not possible; each run explores independently
- Bad: Long-term findings history is not leveraged at aggregation time

### C: Defer - wait for more target data before deciding

Keep proposal in backlog until multi-run runs on 3-4 more targets.

- Good: More data before commitment
- Bad: Indefinite pending state; same decision deferred repeatedly
- Bad: ADR 0043 Triggers already act as passive monitor - no additional deferral value

## Decision Outcome

Adopted option B (reject). Multi-run aggregation with normalization has demonstrated sufficient coverage on both Rust and TypeScript targets. Implementing snapshot-aware pipeline now would add stateful complexity for a secondary concern without empirical evidence that Flavor B is load-bearing. ADR 0043 Reassessment Triggers provide a passive monitor: if aggregation rate drops below 20% or category drift exceeds 50% on future targets, the snapshot-aware approach (or Option C in ADR 0043) can be reconsidered.

### Positive Consequences

- Audit pipeline remains stateless across runs
- Complexity budget preserved for higher-value additions
- ADR 0043 Triggers continue to monitor the need passively

### Negative Consequences

- Flavor B (accumulative deepening) remains unaddressed
- If future targets show high `run2_only` finding rates for legitimate depth reasons, this decision may need revisiting

## Reassessment Triggers

- If ADR 0043 Reassessment Triggers fire on a future target → evaluate whether Flavor B remedy (snapshot-aware) or Option C (category drop) is the better response
- If `run2_only` findings systematically represent deeper (not noisier) analysis - e.g., multiple targets show Run 2 finding genuinely novel issues at >30% rate - reopen this decision
- If a user workflow requires intentional iterative deepening (e.g., "audit this again with focus on what you missed") → implement as a separate focused mode, not a default pipeline change

## References

- ADR 0043 - Normalize findings in audit multi-run aggregation
- ADR 0035 - Audit/verify convergence signal and reconciliation ownership
- workspace/history/audit-2026-04-20-diagnostic-run{1,2,3}.yaml - Rust baseline
- workspace/history/audit-2026-04-20-okr-multirun-verification.yaml - TS verification
