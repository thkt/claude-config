---
status: "accepted"
date: 2026-05-06
decision-makers: thkt
consulted: advisor (Opus reviewer), scout research (industry coverage standards 2026-05-06)
informed: harness consumers, shields spec author
scope: [coding, testing]
---

# Replace absolute coverage thresholds with delta-based gate

## Context and Problem Statement

`rules/development/THRESHOLDS.md` declared C0 ≥90% and C1 ≥80% as absolute coverage floors for the harness. These values were chosen during interactive design dialogue and have no documented rationale (no prior ADR, no commit message reference, no external citation in the file or git history). Industry research (scout 2026-05-06) shows the values are stricter than common practice and risk inducing thin tests:

- General projects: 70-80% recommended; observed average 74-76%
- Google guidance: 60% acceptable / 75% commendable / 90% exemplary, with explicit warning against over-pursuit beyond 90%
- Istanbul / Jest / Vitest documented defaults: 80% across statements, branches, functions, lines
- Codecov guidance: avoid blindly chasing 100%, prefer meaningful tests, and "every commit must maintain or increase" rule
- Atlassian guidance: numerical pressure invites poor testing practices
- LaunchDarkly / general guidance: 90%-as-fail-threshold causes frequent build failure and thin-test padding

A new `rules/development/TESTING.md` is being introduced with explicit anti-patterns ("number-as-goal" trap, AI-generated tests biased toward C0). Keeping absolute floors creates direct tension with that file's stance.

## Decision Drivers

- Industry trend: quality of tests over quantity of coverage
- Existing floor values lack documented rationale; "set during dialogue" is a weak basis
- TESTING.md (new) treats numerical-target chasing as an anti-pattern; harness defaults should not contradict it
- Per-project criticality varies (security tools warrant higher floors, presentational components do not)
- Codecov-style "don't decrease" gate is a recognised alternative to absolute floors

## Considered Options

- α. Loosen absolute floors to industry baseline (C0/C1 ≥80%)
- β. Remove coverage floors entirely; treat reference values only as informational
- γ. Replace absolute floor with delta-based gate (no PR may decrease C0/C1); per-project absolutes via spec NFR

## Decision Outcome

Chosen option: γ — delta-based gate.

THRESHOLDS.md keeps the C0/C1 conceptual definitions but removes the absolute `Target` column. A delta-based rule replaces it: PR coverage must not decrease. Reference values (Istanbul 80%, Google tiered 60/75/90) are noted as informational, not enforced. Per-project absolute requirements live in each project's spec NFR (e.g. shields NFR-005 retains C0 ≥90%, C1 ≥80% as a security-tool override).

### Consequences

Positive:

- Removes weak-rationale absolute values from harness defaults
- Aligns with TESTING.md anti-pattern guidance (no number-as-goal at the harness level)
- Reduces thin-test padding incentive while still preventing silent decay
- Per-project criticality can be expressed in spec NFR without harness override pressure

Negative:

- New projects lose a numeric baseline; they must adopt the delta gate from the first commit or define an explicit spec NFR
- Delta-gate enforcement requires CI plumbing (Codecov, custom scripts, or `gates` CLI extension)
- `audit-2026-04-30 RC-010` selection A text references the absolute floor and must be revised

### Validation

- `rules/development/THRESHOLDS.md` updated: `Target` column removed, delta gate clause added, reference values listed
- `rules/development/TESTING.md` authored with priority-area depth tiers (depth of coverage observation, not absolute %)
- `workspace/planning/2026-03-22-shields/spec.md` NFR-005 annotated as individual override
- `workspace/inbox/audit-2026-04-30-issues/09-rc-010-test-coverage-gate.md` selection A revised
- Cross-references added between the four files above and this ADR

## Pros and Cons of the Options

### α. Loosen absolute floors to ≥80%

- Good: Strong industry citation (Istanbul/Jest/Vitest default, Google commendable upper boundary). Easy to enforce.
- Neutral: Still an absolute floor; familiar pattern for teams that expect a percentage.
- Bad: Partially contradicts TESTING.md anti-pattern (number-as-goal). Still encourages padding to clear the gate.

### β. Remove coverage floors entirely

- Good: Fully aligned with TESTING.md. No tension between harness and rule files.
- Neutral: Per-project NFR can fill the gap when needed.
- Bad: No harness-level guardrail; new projects start with no coverage discipline. Coverage may decay silently between releases.

### γ. Delta-based gate

- Good: Aligned with TESTING.md and Codecov practice. Per-project criticality stays expressible via spec NFR. Guardrail against decay survives without imposing an arbitrary floor.
- Neutral: Needs CI plumbing for enforcement; not free.
- Bad: A project that starts at low coverage stays at that level until improved deliberately; the gate alone does not raise it.

## More Information

References:

- `rules/development/THRESHOLDS.md` — updated in this change
- `rules/development/TESTING.md` — new in this change
- `workspace/planning/2026-03-22-shields/spec.md` NFR-005 — clarified as individual override
- `workspace/inbox/audit-2026-04-30-issues/09-rc-010-test-coverage-gate.md` — selection A revised
- scout research 2026-05-06: industry coverage thresholds, branch coverage standards (Codecov, Atlassian, Google, Istanbul/Jest/Vitest, LaunchDarkly)

### Reassessment Triggers

- A project needs an absolute floor because the delta gate lets a low-coverage module stay low indefinitely
- The do-not-decrease rule blocks routine refactors that legitimately delete tested code
