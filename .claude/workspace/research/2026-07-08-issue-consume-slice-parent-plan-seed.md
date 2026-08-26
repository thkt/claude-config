# Research: issue-consume-slice-parent-plan-seed

Generated: 2026-07-08
Session: efc72beb-2ae8-4e06-aa72-aa9a4ae358e6
Intent: Feature planning
Domain: General
Prior research: none found

## Purpose

Investigate the minimal change for `/issue`, when invoked on a picked-up slice child issue, to follow the child body's `## Parent` link, fetch the parent epic's `## Plan`, and inject it as a non-authoritative prior-art seed into research / think, so the slice→build handoff carries prior planning context. The goal is to confirm the change stays inside `/issue` and does not weaken the plan-gate.

## Key Findings

| Priority  | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                              | Source                                                                                                                                                                   | Next Action                                                                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocker   | `/issue` has no existing-issue-ref intake. `$ARGUMENTS` is treated as a new issue description, and the only publish path is `gh issue create`. There is no `gh issue edit` anywhere in the skill or veto hooks. So "receiving a picked-up child issue" is a prerequisite capability the skill does not yet have, larger than a seed-injection tweak.                                                                                                 | skills/issue/SKILL.md:31, skills/issue/SKILL.md:137, disconfirmation D1 (grep `issue edit` → 0 hits)                                                                     | Add issue-ref intake to `/issue` Input, reusing slice's `gh issue view <N>` pattern (slice SKILL.md:16). This is the first unit, not an afterthought.                                                            |
| Blocker   | Create-vs-edit fork is unresolved and drives PR scope. Task Q4 says build consumes a `新規` (new) issue, implying `/issue` creates a fresh refined issue (reading A). slice SKILL.md:25 says refine the slice "via /issue first (which adds the Plan)", implying `/issue` edits the child in place (reading B). The mechanism only supports A today (create-only, veto gated to create). B needs a new `gh issue edit` path that veto does not gate. | task Q4; skills/slice/SKILL.md:25; skills/issue/SKILL.md:137; hooks/veto/pre-issue-create.sh:12; disconfirmation D1/D3                                                   | Surface both readings to the user as the decision that shapes the feature. Default to A (Q4's explicit `新規`), but note the slice SKILL.md:25 contradiction must be reconciled either way.                      |
| High      | Under reading A, the picked-up child is left open / orphaned unless the feature also closes or links it. slice explicitly does not modify parents; the symmetric question for the refined child is unhandled. This is squarely Q1's "conflict," not out of scope.                                                                                                                                                                                    | skills/slice/SKILL.md:61; skills/issue/SKILL.md:137 (no close / link step)                                                                                               | Decide child disposition (close as superseded, link, or leave) as part of the design; it is not covered by seed injection.                                                                                       |
| High      | Q3 reward-hack risk confirmed. The plan-gate is structure-only. `validate_plan` checks units non-empty, test_command present, id uniqueness, per-unit tests / files / goal / contract non-empty, depends_on referential integrity, and cycle absence. No freshness, size, or relevance check. A stale or oversized parent `## Plan` that is structurally well-formed passes the gate unchanged when seeded into a child.                             | hooks/veto/veto.py:237 (`validate_plan`, canonical); workflows/build.js:250-282 (marker-fenced copy); workflows/build.js:240 sync note                                   | Keep the parent Plan strictly non-authoritative (prior-art seed only). Drift detection must ride on the research-first LLM layer (issue SKILL.md:116); do not rely on any deterministic gate to catch staleness. |
| High      | Q2 parent-ref format is loose prose, not a pinned machine anchor. slice's `## Parent` section says only "A reference to the parent issue," with no fixed shape (`#123` vs URL vs `Parent: #123`). Reliable parent-number extraction depends on whatever slice's LLM happens to emit. If a tolerant parser is not acceptable, the format must be pinned in `/slice` too, contradicting "`/issue` のみ改修."                                           | skills/slice/SKILL.md:66-68                                                                                                                                              | Conditional: scope stays `/issue`-only if a tolerant parser (accept `#N` or URL, extract trailing number) is acceptable. Otherwise pin the `## Parent` format in slice first (a `/slice` change).                |
| Medium    | The seed's premise "parent epic carries a `## Plan`" holds only when the epic went through `/issue` Phase 3. An epic approved via the Split Assessment runs the full flow, so it does carry a Plan; but a manually-created or externally-sourced epic sliced directly has no `## Plan`, and the seed has nothing to draw from.                                                                                                                       | inferred from skills/issue/SKILL.md:90 (epic "run the rest of the flow unchanged"); skills/slice/SKILL.md:16 (slice accepts any issue ref, not only `/issue`-born epics) | Add a "parent has no Plan" fallback: proceed with the normal research / think flow and skip the seed rather than error.                                                                                          |
| Confirmed | Q4 holds: build.js needs no change. The Plan-heading match reads `## Plan` from any body via regex, source-agnostic. It does not care whether the issue was refined from a seeded parent.                                                                                                                                                                                                                                                            | workflows/build.js:333 (`body.match(/^##\s+Plan\b.*$/m)`); disconfirmation D4                                                                                            | None. Leave build.js unmodified, as the task states.                                                                                                                                                             |

## Available Data

| Type       | Item                                       | Note                                                                                                                                                               |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Convention | slice issue-ref intake `gh issue view <N>` | skills/slice/SKILL.md:16. Reusable in `/issue` Input for reading the picked-up child and its `## Parent`.                                                          |
| Convention | `## Plan` section format                   | skills/issue/references/plan-section.md. Shared source for issue SKILL.md and build.js; the seed is a full Plan block in this shape.                               |
| Config     | veto PreToolUse gate                       | skills/issue/SKILL.md:8-22; hooks/veto/pre-issue-create.sh. Binds evidence (research / challenge / skip) to the create by title; a new edit path would be ungated. |
| File       | plan-gate implementations                  | hooks/veto/veto.py:237 canonical; workflows/build.js:250-282 mirror. Both structure-only.                                                                          |

## Constraints

| Category    | Constraint                                                                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outcome     | Move QA from LLM discretion to deterministic layers. A prior-art seed injected into an LLM-judgment step (research / think) adds no deterministic guarantee; it must not be presented as one. (.claude/.claude/OUTCOME.md) |
| Cross-skill | slice does not close or modify any parent issue (slice SKILL.md:61). A symmetric restraint likely applies to how `/issue` may touch the parent when reading its Plan; reading the parent is safe, modifying it is not.     |
| Process     | .ja/ is canonical; any `/issue` or `/slice` SKILL.md edit updates `.ja/` first and mirrors to the English path in the same commit (ADR-0073).                                                                              |

## Disconfirmation Check

Phase 5 did not run (Feature planning, not Bug investigation). Verbatim commands and raw output from the Phase 4 scratch:

D1 — is there any `gh issue edit` path in the issue skill or veto hooks?

```
$ grep -rn 'issue edit' skills/issue hooks/veto
(no output)
exit=1 (0=found,1=none)
```

Zero hits confirms `/issue` and veto have no edit-in-place path; the only publish is create. Cross-check: `grep -rn 'gh issue create'` returns skills/issue/SKILL.md:137 and skills/slice/SKILL.md:97 as the sole create sites, and pre-issue-create.sh:12 matches `*'"tool_name":"Bash"'*gh*issue*create*`, so the gate covers create only. The 0-hit on `issue edit` is a true absence, not tool misuse (the same grep invocation returns hits for `issue create`).

D4 — does build.js read `## Plan` source-agnostically?

```
$ grep -n 'planHeading\|no-plan' workflows/build.js
333:const planHeading = body.match(/^##\s+Plan\b.*$/m);
334:if (!planHeading) {
336:    stopped: "no-plan",
340:const afterHeading = body.slice(planHeading.index + planHeading[0].length);
```

The regex reads any body's `## Plan`, confirming build.js needs no change (Q4).

## References

| Path                                    | Description                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| skills/issue/SKILL.md                   | Target skill. Input handling (:31), Split Assessment (:90), Research seed point (:116), publish (:137).                                    |
| skills/slice/SKILL.md                   | Sibling skill. Issue-ref intake pattern (:16), `/issue` refine contract (:25), no-parent-modify rule (:61), `## Parent` template (:66-68). |
| skills/issue/references/plan-section.md | `## Plan` format contract shared by issue SKILL.md and build.js.                                                                           |
| hooks/veto/veto.py                      | Canonical `validate_plan` (:237), structure-only plan-gate.                                                                                |
| workflows/build.js                      | build workflow. validate() copy (:250-282), source-agnostic Plan match (:333).                                                             |
| hooks/veto/pre-issue-create.sh          | PreToolUse gate, matches `gh issue create` only (:12).                                                                                     |

## Coverage Notes

- Unknown: create-vs-edit (reading A vs B) is a user decision, not resolvable from the sources (they conflict). Close it by asking the user which shape the refined child takes before /think.
- Unknown: whether a tolerant `## Parent` parser is acceptable or the slice format must be pinned. Close it during /think by deciding parser tolerance vs a coordinated slice edit.
- Inference flagged: "parent epic carries a `## Plan`" is inferred from issue SKILL.md:90, not verified against a live epic. The fallback (no Plan → skip seed) covers the case where it does not hold.
- explorer-feature spawn: skipped. This is a markdown-skill trace across three known files (issue SKILL.md, slice SKILL.md, build.js) plus veto, walked exhaustively by direct read; there is no code execution path to trace beyond the skill flows already mapped. The two spots a second pass would earn its keep (parent-format reliability, parent-has-Plan premise) were closed by targeted reads (slice SKILL.md:66-68, veto.py:237) rather than a full spawn.
- Advisor: ran pre-synthesis. Flagged the create-vs-edit fork as the finding to surface rather than collapse (folded into the two Blocker rows), the parent-format `/slice`-scope risk (Q2 row), and the parent-has-Plan inference (Medium row). No missed area beyond these, which are now recorded.

## Next Steps

| Intent           | Next Command |
| ---------------- | ------------ |
| Feature planning | `/think`     |
