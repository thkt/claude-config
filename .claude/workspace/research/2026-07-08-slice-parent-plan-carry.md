# Research: slice-parent-plan-carry

Generated: 2026-07-08
Session: efc72beb-2ae8-4e06-aa72-aa9a4ae358e6
Intent: Feature planning
Domain: General
Prior research: none found

## Purpose

Investigate where slice would carry a source issue's `## Plan` into each child as an inert `## Parent plan` reference, and whether that reference actually lightens later /issue refinement without breaking build's no-plan detection.

## Key Findings

| Priority | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Source                                                                                                                                 | Next Action                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| High     | Value premise does not hold as framed. /issue refines from the child's own body (`$ARGUMENTS`), never fetches a referenced parent, so an inert `## Parent plan` is not consumed by the refine loop. Benefit collapses to an inline goal hint that is largely redundant with the child's existing What to build + Acceptance criteria, OR the real leverage requires an unspecified /issue behavior change the proposal does not scope.                                                                                                                                                                                                                                                                                                                                  | issue SKILL.md:32 (Input = `$ARGUMENTS`), Phase 1 (draft from description); slice Issue Template lines 70-78; adversarial critic NO-GO | Decide in /think: either scope a /issue change that reads the parent Plan, or drop the feature as thin                     |
| High     | slice has no Plan-parsing today, so the carve/map is net-new, not existing behavior. A vertical tracer-bullet slice does not map 1:1 to a parent `### U-NNN` unit (one slice draws from several units, or one unit spans several slices). U-NNN tokens exist only when the source was already an /issue-refined Plan; a raw plan/spec/PRD source (accepted at slice SKILL.md:16) has no unit id to point at, so the pointer is well-defined only for a narrow subset of slice inputs.                                                                                                                                                                                                                                                                                   | ugrep of slice SKILL.md (0 Plan/U-NNN parsing hits); slice SKILL.md:12,16,37; plan-section.md units definition                         | Treat carve/map as unknown, requires design in /think                                                                      |
| High     | Insert point for Q1 is concrete: a new `## Parent plan` sibling section in the slice Issue Template between `## Parent` (SKILL.md:66-68) and `## What to build` (line 70), gated on the same "source was an existing issue" condition as `## Parent`. Relationship: `## Parent` = link to the parent issue; `## Parent plan` = inert copy/pointer of the parent's Plan body. Implementation is slice SKILL.md prompt only; build side unchanged.                                                                                                                                                                                                                                                                                                                        | slice SKILL.md:63-85 (Issue Template), line 66 (`## Parent`)                                                                           | Edit slice Issue Template at this locus if the feature proceeds                                                            |
| Medium   | Heading safety is load-bearing but unguarded, and fragile on word order. `## Parent plan` does not match build.js:333 `/^##\s+Plan\b.*$/m` (empirically false), but any heading whose first word after `## ` is Plan does match (`## Plan source` -> true, verified). A future tidy to `## Plan (parent)` would silently make build extract the inert reference as the authoritative plan. Nothing pins `## Parent plan` as a reserved non-matching heading.                                                                                                                                                                                                                                                                                                            | build.js:333-336; node regex probe; plan-section.md:3 (shared format contract)                                                         | Add a NEGATIVE regression test (`## Parent plan` -> no-plan) co-located with build.js:333 plus a reserved-heading comment  |
| Medium   | Co-existence is mechanically safe today but has a fail-safe collision after refine. Build slices planSection only between `## Plan` and the next `##` (build.js:340-342), so a sibling `## Parent plan` carrying `### U-900` / `- T-900` is excluded from the deterministic id set whether placed before or after `## Plan` (both verified: bodyUnitIds=['U-001'], bodyTestIds=['T-001']). But build.js:352 feeds the WHOLE body to the extract agent while the U/T cross-check is computed from planSection only; if a refined child retains `## Parent plan` with parent U-NNN/T-NNN ids and the extract agent echoes them, units_extra becomes non-empty -> extraction-mismatch STOP (build.js:388). Fails safe (no wrong plan built) but blocks a legitimate build. | build.js:340-346, 352, 383-388; node placement probes (before + after)                                                                 | Specify that /issue STRIPS `## Parent plan` when it writes `## Plan`, or forbid the U-NNN/T-NNN token shape in the pointer |

## Available Data

| Type       | Item                                         | Note                                                                                                                              |
| ---------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| File       | skills/slice/SKILL.md                        | Issue Template 63-85; `## Parent` at 66; Phase 5 publish 57-61; language read 89                                                  |
| File       | workflows/build.js                           | Load phase 290-420; planHeading 333; planSection slice 340-342; id sets 344-346; extract whole body 352; cross-check STOP 383-388 |
| File       | skills/issue/SKILL.md                        | Input 32; Phase 1 draft-from-description; refines from child body, no parent fetch                                                |
| File       | skills/issue/references/plan-section.md      | Shared `## Plan` format + extraction contract; line 3 "change the format here first, then propagate"                              |
| File       | workflows/build/tests/build.behavior.test.js | node:test + runWorkflow; bodyFor/makePlan helpers; no-plan and contract-prose-non-definition cases exist; stopped-value snapshot  |
| Convention | rules/conventions/MARKDOWN.md                | .ja canonical first, mirror EN same commit; tables over bold in LLM-facing files                                                  |

## Constraints

| Category | Constraint                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract | `## Plan` heading is a deliberately-broadened shared format contract (plan-section.md:3); a new heading that starts with the word Plan collides with build.js:333                                |
| Mirror   | .ja/skills/slice/SKILL.md is canonical; edit .ja first, mirror to skills/slice/SKILL.md in the same commit (MARKDOWN.md:20). Both files currently carry an unrelated uncommitted diff at line 25 |
| Build    | build cross-check derives ids from planSection but feeds the whole body to the extract agent, so any U-NNN/T-NNN outside `## Plan` risks a fail-safe extraction-mismatch STOP if echoed          |

## Disconfirmation Check

Prior-research scan (Phase 2), verbatim:

```
$ bfs .claude/workspace/research -name '*.md'
(no slice / parent-plan research file present; directory created fresh for this report)
```

Q2 net-new negative (slice has no Plan/U-NNN parsing today), verbatim:

```
$ ugrep -n 'U-[0-9]\{3\}|## Plan|Plan' skills/slice/SKILL.md
25:.../slice's value is decomposition and dependency-ordered publish. ... A sliced issue carries no `## Plan` yet, so handing it straight to /build stops at `no-plan`. ...
```

The single hit is prose in the distinction paragraph, not parsing logic. No `### U-NNN` reader exists in slice. 0 parsing hits confirms the carve is net-new rather than a mistaken absence.

Heading collision discriminator (node regex probe), verbatim results: `## Parent plan` -> false, `## Plan` -> true, `## Plan source` -> true, `## Planning` -> false, `## Parent` -> false. Safety therefore hinges on the exact name.

Co-existence probes (node), verbatim results: with `## Parent plan` carrying `### U-900` / `- T-900` placed BEFORE `## Plan` -> bodyUnitIds=['U-001'], bodyTestIds=['T-001']; placed AFTER `## Plan` -> bodyUnitIds=['U-001'], bodyTestIds=['T-001']. Parent ids excluded in both orders.

## References

| Path                                         | Description                                                  |
| -------------------------------------------- | ------------------------------------------------------------ |
| skills/slice/SKILL.md                        | slice skill; Issue Template and `## Parent` section          |
| workflows/build.js                           | build Load phase; no-plan detection and id cross-check       |
| skills/issue/SKILL.md                        | /issue input and Phase 1; confirms no parent fetch           |
| skills/issue/references/plan-section.md      | shared `## Plan` format + extraction contract                |
| workflows/build/tests/build.behavior.test.js | build behavior test harness for the negative regression test |

## Coverage Notes

- Q1 (insert point) answered concretely: slice Issue Template between `## Parent` (66-68) and `## What to build` (70).
- Q2 (carve/map) answered as unknown, requires design: net-new logic, and well-defined only when the source was already an /issue-refined Plan. Close it in /think by deciding the carve unit (per-child unit-id subset vs full-unit copy vs goal-hint only) and the raw-source fallback.
- Q3 (build no-plan detection) answered: no false bypass; `## Parent plan` is ignored by build.js:333 and its ids are excluded from the planSection cross-check. Residual fail-safe collision closes if /issue strips the section on refine.
- Q4 (format interference) answered: safety is real but rests on two constraints (name not starting with Plan; section stays a sibling `##`, never nested under `## Plan`). Both must be guarded by a negative regression test, since neither is currently enforced.
- Tool disagreement: none. Regex probes and file reads agreed.
- Unverified external claim: none.
- Advisor: consulted before synthesis; flagged the Q2 net-new framing (fixed with the 0-hit ugrep and AFTER-placement probe) and required recording the two skips below.
- Skip: OUTCOME.md absent for this repo; stub deferred as out-of-scope for read-only research.
- Skip: explorer-feature not spawned; all four questions resolve to files named in the task (slice SKILL.md:66, build.js:333), so a direct trace plus empirical verification substitutes for a where-does-it-live sweep.
- Adversarial: a critic-design pass returned NO-GO. Highest-weight objection is the value premise (High finding 1). The mechanical safety findings (Q3/Q4) are sound but do not rescue the premise. Carry this NO-GO into /think as the first thing to resolve.

## Next Steps

| Intent             | Next Command |
| ------------------ | ------------ |
| Feature planning   | `/think`     |
| Bug investigation  | `/fix`       |
| Understanding only | complete     |
