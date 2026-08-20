---
status: "accepted"
---

# ADR-0012: Flatten Audit Pipeline - Remove Compound Reviewers

## Context and Problem Statement

Audit pipeline uses 3-layer architecture: Leader → Compound-reviewer → Sub-reviewer. Compound-reviewers (foundation, safety, quality) orchestrate 3-6 sub-reviewers each, normalize schemas, run Council protocol, and DM results to challenger/verifier.

2026-02-13 audit of 43 files revealed compound layer creates significant overhead without proportional quality gain.

## Decision Drivers

- Audit execution time: 10-16min (compound) vs 2.5min (standalone)
- Agent spawn count: 19 (compound) vs 4 (standalone)
- File read redundancy: 612 (compound) vs 129 (standalone)
- Compound layer 4 functions all replaceable by Leader

## Considered Options

- Option A: Flat Spawn
- Option B: Focus-Based Routing (file type → reviewer mapping)
- Option C: Two-Phase Adaptive (quick scan → specialist)
- Option D: Status Quo

### Option A: Flat Spawn

Leader spawns sub-reviewers directly. Eliminates compound layer.

### Option B: Focus-Based Routing (file type → reviewer mapping)

Leader routes files to relevant reviewers only. Reduces file reads.

### Option C: Two-Phase Adaptive (quick scan → specialist)

Phase 1: general-purpose quick scan. Phase 2: specialist only where needed.

### Option D: Status Quo

Keep existing 3-layer architecture.

## Decision Outcome

**Tier-based hybrid** combining A + B:

| Tier          | Architecture                               |
| ------------- | ------------------------------------------ |
| Small (1-3)   | Leader reviews directly                    |
| Medium (4-15) | 3 general-purpose reviewers                |
| Large (16+)   | Sub-reviewers with file routing (Option B) |

Compound-reviewer layer removed in all tiers.

## Evidence

### Quantitative (2026-02-13 audit)

| Metric          | Compound Pipeline | Standalone | Ratio |
| --------------- | ----------------- | ---------- | ----- |
| Agent instances | 19                | 4          | 4.75x |
| File reads      | ~612              | 129        | 4.74x |
| Messages        | 27                | 3          | 9x    |
| Execution depth | 10 layers         | 2 layers   | 5x    |
| Wall time       | 10-16min          | ~2.5min    | 4-6x  |
| Findings        | 78                | 43         | 0.55x |

### Qualitative

| Factor                      | Finding                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| Sub-reviewer specialization | 7/13 have unique expertise (verified)                            |
| Compound layer functions    | All 4 replaceable by Leader (verified)                           |
| Comparison fairness         | 3 unfair factors identified (model, prompt, tools)               |
| Idle notification confusion | Compound layer's sub-task waiting indistinguishable from "stuck" |

### Sub-reviewer Specialization (verified)

| Category              | Count | Reviewers                                                                                             |
| --------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| Irreplaceable         | 7     | root-cause, type-design, test-coverage, reviewer-progressive, accessibility, performance, testability |
| Partially replaceable | 4     | security, silent-failure, type-safety, design-pattern                                                 |
| Replaceable           | 2     | code-quality, document                                                                                |

## Consequences

### Positive

- Execution time: ~5-8min (Large), ~3min (Medium), ~1min (Small)
- Agent count: max 14 (Large), 4 (Medium), 1 (Small)
- File reads: ~150-250 (Large with routing)
- Simpler error handling (fewer failure points)
- No idle notification confusion (standalone agents complete then return)

### Negative

- Council cross-domain sharing lost (Leader must compare results manually)
- Schema normalization done by Leader instead of dedicated agent
- Compound-reviewer definitions deleted (knowledge captured in this ADR)

### Neutral

- Sub-reviewer definitions unchanged
- Challenger/Verifier/Integrator unchanged (Large tier only)
- Snapshot format unchanged

## Reassessment Triggers

- The tier boundaries stop matching real audit sizes, so a Small run spawns as many agents as a Large one
- Leader review becomes the bottleneck that removing the compound layer was meant to avoid
