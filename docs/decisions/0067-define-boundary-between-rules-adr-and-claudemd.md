---
status: "superseded by DR-0106"
date: 2026-08-25
decision-makers: thkt
scope: [meta, documentation]
---

# Define boundary between RULES, ADR, and CLAUDE.md

## Context and Problem Statement

~/.claude harness has three classes of normative documents: RULES (`~/.claude/rules/`), ADR (`~/.claude/docs/decisions/` + per-project `docs/decisions/`), and CLAUDE.md (project roots + harness root). Each class's responsibility has been implicit, so the destination of a new design decision is ad-hoc.

The 2026-05-13 scope-tag pilot surfaced three boundary irregularities:

- `rurico/0003` and `amici/0002` ("evaluation methodology") are a same-title pair across repos; the duplication was resolved historically (`amici/0002` supersedes `rurico/0003`) but no rule forced surfacing.
- ADR-0066 (CLI exit code policy) is a cross-language directive; whether it should live as ADR (history) or RULES (always-on) is unclear.
- ADR-0028 (oxc parser test gate) overlaps `rules/development/TESTING.md` on `scope=testing`; the split is undocumented.

A future contributor cannot derive the intended destination from existing structure alone. The scope-tag aggregator (`audit-adr-scopes.py`) requires a stable rule for what each artifact owns.

## Decision Drivers

- New decisions flow to the right artifact on first attempt (lower per-decision friction).
- Scope-tagged ADR aggregation has a stable contract (`audit-adr-scopes.py` can rely on the boundary).
- Existing assets (91 ADRs, 18 RULES files, multiple CLAUDE.md) migrate incrementally, not in a single sweep.
- RULES auto-attach via `paths:` frontmatter remains the mechanism for "always applied" directives.

## Considered Options

### Option 1: Three-artifact responsibility split with scope-tagged ADR cross-cutting (chosen)

- RULES: language/domain directives applied at all times; `paths:` frontmatter auto-attaches per file; living document.
- ADR: immutable record of decisions, alternatives considered, and rationale; `scope:` tag for multi-axis discovery.
- CLAUDE.md: project-specific current state and WHY; living document; per-project entry point.
- When the same `scope:` clusters across repos, treat as a promotion candidate to RULES or meta ADR.

Good:

- Builds on the existing tree shape; migration is incremental.
- `audit-adr-scopes.py` mechanizes horizontal-expansion detection.
- ADR immutability and RULES livingness coexist without contradiction.

Bad:

- Scope-vocabulary design is now a recurring responsibility (current set: `rust`, `ts`, `cli`, `coding`, `testing`, `evaluation`, `meta`, `documentation`).
- Three artifact-types means a small learning curve for new contributors.

### Option 2: Collapse to ADR as the single source of truth

All directives become ADRs; RULES and CLAUDE.md become navigation indices that reference ADRs.

Good:

- Single source of truth, unified history.

Bad:

- ADR immutability conflicts with the living-document nature of "always-on" directives.
- Loses RULES `paths:` auto-attach mechanism.
- High one-time migration cost for the existing 18 RULES files.

### Option 3: Keep the implicit status quo

Continue without an explicit boundary; rely on convention.

Good:

- Zero immediate cost.

Bad:

- New decisions land inconsistently across artifacts.
- `audit-adr-scopes.py` operates without a stable contract.
- The three irregularities (Context) continue to accumulate.

## Decision Outcome

Adopt Option 1.

Artifact responsibilities:

| Artifact  | Domain                                         | Lifecycle             | Discovery mechanism                    |
| --------- | ---------------------------------------------- | --------------------- | -------------------------------------- |
| RULES     | Language and domain directives, always applied | Living document       | `paths:` frontmatter auto-attach       |
| ADR       | Decisions: rationale + alternatives considered | Immutable + scope tag | `grep scope`, `audit-adr-scopes.py`    |
| CLAUDE.md | Project-specific current state and WHY         | Living document       | Per-project root as the AI entry point |

Routing rules for new decisions:

1. The rule itself goes to RULES. The rationale for choosing that rule goes to ADR.
2. ADRs declare `scope:` in YAML frontmatter (`scope: [a, b]`) or as a `- Scope: [a, b]` bullet for ADRs in bullet-list format.
3. When `audit-adr-scopes.py` reports a same-scope cross-repo cluster with verdict OPEN, write a new RULES entry (or meta ADR) capturing the common directive and cross-link from the source ADRs. The source ADRs stay in place as the historical rationale; ADR immutability is preserved (consistent with Rule 1).
4. Project-specific state belongs in CLAUDE.md. If the state generalizes across projects, promote to ADR or RULES.

### Confirmation

- No directive exists simultaneously in both RULES and an active (non-superseded) ADR without a documented reconciliation note (per Rule 1: rule in RULES, rationale in ADR; co-location requires explicit cross-link).
- `audit-adr-scopes.py` returns no OPEN cluster whose entries lack disposition (each open cluster either has a RULES promotion or an explicit "kept as ADR" note).
- New ADRs include `scope:` in frontmatter or as a `- Scope:` bullet (mechanism check supporting the above two boundary checks).

### Consequences

- `/adr` skill should be extended (future work) to prompt for `scope:` on creation.
- Existing ADR migration is opportunistic: cluster detection drives priority, not blanket backfill.
- Horizontal-expansion candidates become machine-discoverable.
- Co-location of a topic in both RULES and ADR is now a structured signal (overlap means: either ADR records the historical rationale for the current RULES, or the two diverged and need reconciliation).

Disposition of the three Context irregularities under this boundary:

- `rurico/0003 ↔ amici/0002` (evaluation methodology): already resolved historically; aggregator now classifies the cluster as RESOLVED (status: superseded). No further action.
- ADR-0066 (CLI exit code policy): stays as ADR. The cross-language rationale belongs in history. If reuse pressure rises across more CLIs, write a RULES entry per Rule 3; ADR-0066 remains as the originating rationale.
- ADR-0028 (oxc parser test gate) ↔ `rules/development/TESTING.md`: intentional co-location under this boundary. ADR-0028 records the rationale for the test-gate approach; TESTING.md states the active rules. A cross-link from TESTING.md to ADR-0028 should be added (Step 4 migration item) to make the relationship explicit.

## More Information

- Related: ADR-0005 (documentation role separation), ADR-0042 (skill-specific scripts colocation), ADR-0058 (inline single-consumer agent context skills), ADR-0062 (delta-based coverage gate, MADR v4 frontmatter precedent).
- Pilot results (2026-05-13): 5 ADRs tagged (`~/.claude/0028`, `~/.claude/0062`, `~/.claude/0066`, `rurico/0003`, `amici/0002`); aggregator MVP at `~/.claude/skills/audit-undocumented/scripts/audit-adr-scopes.py`; cluster detection successfully flagged the `rurico/0003 ↔ amici/0002` pair as RESOLVED after the status patch.
- Future work: `/adr` skill prompts for `scope:`; `scope` vocabulary governance (when to add a new scope token); promotion pipeline ADR (Step 4 of the backcasting path).

### Reassessment Triggers

- A new decision has no obvious home on first attempt, so the boundary stops answering the routing question
- The scope-tagged aggregation needs a contract the boundary does not supply
