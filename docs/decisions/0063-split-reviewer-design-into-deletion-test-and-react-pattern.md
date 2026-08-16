---
status: "accepted"
date: 2026-05-07
decision-makers: thkt
---

# Split reviewer-design into deletion test and react-pattern

## Context and Problem Statement

Issue #28 proposed adding Ousterhout's deletion test to `reviewer-design` so that shallow modules surface as findings. During implementation, two premises broke at once.

Premise 1: `reviewer-design` was named generic but its phases (Container/Presentational, custom hooks, state-tool placement, prop-drilling) are React-mechanism bound. Premise 2: deletion test must apply to Rust code too, not just React.

Adding the deletion test as Phase 5 of the existing `reviewer-design` would require the agent prompt to fork on language detection. That is two reviewers in one file.

## Decision Drivers

- Deletion test concept is language-agnostic (Ousterhout: behavior hidden / interface exposed)
- Existing `reviewer-design` phases assume React mechanisms that have no Rust counterpart
- `project_reviewer-restructuring-backlog.md` discourages new agents in favor of consolidation
- `feedback_incident-driven-adoption.md` requires structural changes to be load-bearing, not speculative

## Considered Options

- Split: rename React parts to `reviewer-react-pattern`, rebuild `reviewer-design` around deletion test
- Expand: keep `reviewer-design` and add language-fork prompt for Rust + React deletion test
- Move: integrate deletion test into `reviewer-encapsulation` (TD prefix), keep `reviewer-design` React-only
- Defer: stay React-only and punt Rust scope to a future issue

## Decision Outcome

Chosen option: "Split", because it removes the misnomer (`reviewer-design` was not generic), keeps React mechanisms in a dedicated reviewer where they read clearly, and lets the deletion test cover any language without prompt forking. Deviation from the issue text is mechanical (rename + rebuild) and the user accepted the breakage explicitly.

### Consequences

- Good, because `reviewer-design` (DP) is now language-agnostic and runs on `*.ts`, `*.tsx`, `*.rs`
- Good, because `reviewer-react-pattern` (RP) names what the legacy phases actually were
- Good, because baseline harness ships with the change (Recall 3/3, FP 0/2 on 6 cases)
- Bad, because existing audit history that cited `DP-N` findings now refers to a different category set
- Bad, because two reviewers can both fire on `*.tsx` files; integrator must merge findings cleanly

### Confirmation

`agents/reviewers/test/reviewer-design/` contains 6 cases (3 shallow, 2 deep, 1 borderline) across React and Rust. Each future change to either reviewer must keep `results/<date>-baseline.json` Recall stable. Drift in category names or summary metric schema indicates the agent picked up stale prompts and requires investigation.

## Pros and Cons of the Options

### Split

- Good, because each reviewer's lens is single-purpose
- Good, because deletion test is one phase, not a forked sub-prompt
- Bad, because `*.tsx` routing now fires both reviewers; potential overlap on wrapper components

### Expand

- Good, because issue-faithful (no rename)
- Bad, because language fork inside one prompt is two reviewers in one file
- Bad, because calibration examples and findings would interleave React mechanism with module depth

### Move (into reviewer-encapsulation)

- Good, because deletion test conceptually fits encapsulation (interface earns its hidden behavior)
- Bad, because deviates from issue text without solving the React-only misnomer
- Bad, because TD prefix already covers invariant-driven type design; depth adds a different lens

### Defer

- Good, because zero churn
- Bad, because punts the user-stated Rust requirement
- Bad, because the misnomer continues to mislead

## More Information

### Architecture

```text
reviewer-design     (DP)  → module depth via deletion test, any language
reviewer-react-pattern (RP) → Container/Presentational, hooks, state, anti-pattern
```

### Quality Attributes

| Attribute          | Priority | Approach                           |
| ------------------ | -------- | ---------------------------------- |
| Recall on shallow  | High     | Harness baseline gate              |
| Naming clarity     | High     | Reviewer name reflects actual lens |
| Audit blast radius | Medium   | Single PR (#43), 18 files          |

### Trade-offs

Two reviewers running on `*.tsx` instead of one, in exchange for lens clarity per reviewer and language portability for the depth check.

### Reassessment Triggers

- If `*.tsx` audits regularly produce duplicate findings between DP and RP, merge or differentiate further
- If Recall on Rust shallow drops below 80% across two consecutive baselines, revisit deletion test phrasing for Rust

### References

- PR #43
- Issue #28
- `agents/reviewers/test/reviewer-design/results/2026-05-07-baseline.json`
