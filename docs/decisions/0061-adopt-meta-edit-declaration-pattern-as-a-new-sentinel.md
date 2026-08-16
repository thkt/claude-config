---
status: "accepted"
date: 2026-05-03
decision-makers: thkt
consulted: advisor (Opus reviewer), spike at /tmp/declarator-spike/
informed: sentinels family maintainers
---

# Adopt meta-edit declaration pattern as a new sentinel

## Context and Problem Statement

The current `sentinels` family (shields/guardrails/formatter/reviews/gates/chronicler) is uniformly reactive: every hook either inspects what an edit already produced or runs lint immediately before the edit. Test-discipline rules captured in CLAUDE.md and Skills decay across long contexts and are bypassed when the agent self-classifies an edit as "minor". The hiniachi/meta-edit project (TypeScript MCP + 2 hooks, v0.3.1) demonstrates a different shape: force the agent to declare the kind of edit _before_ native Edit/Write/MultiEdit runs, and bind the declaration to a single-use ticket that a PreToolUse hook validates. Should we adopt this pattern as a new sentinel, and if so, in what form?

## Decision Drivers

- Tool descriptions are reloaded at every call; CLAUDE.md and Skill descriptions are not guaranteed to influence behavior once context fills (advisor: forced-read injection layer is the load-bearing part).
- No edit-kind metadata is captured anywhere in the current pipeline; gates runs all tests instead of binding test type to edit type.
- `sentinels` has so far shipped only stdio hooks; introducing an MCP server is a new product category for the family (advisor finding 2).
- Subagent fan-out (Task tool) is heavier in this environment than in meta-edit's; ticket lifecycle across parent/child agents is unverified (advisor finding 3).
- Spike at `/tmp/declarator-spike/` confirmed file-based ticket flow (declare → consume → deny on second use → deny on target mismatch) works end-to-end with ~110 LOC.

## Considered Options

- A. Adopt as a new sentinel (`declarator`): MCP server + PreToolUse hook + edit log
- B. Status quo (CLAUDE.md and Skills only)
- C. Description-only adoption (publish kind catalog as a Skill, no MCP, no ticket)
- D. Fork hiniachi/meta-edit and rebrand

## Decision Outcome

Chosen option: A, scoped to an MVP that ships a single new sentinel with 3-6 kinds (not 18) and ships only the ticket-binding mechanism. Concretely: a new CLI repository at `~/GitHub/cli/declarator` (parallel to shields/guardrails/etc.) registered into the existing `~/GitHub/plugins/sentinels` marketplace. Storage is project-scoped at `.declarator/state/` (grants/ and edits.jsonl) to mirror meta-edit and to keep subagents in the same project sharing state without cross-project leakage. Implementation language defaults to Rust to match the existing five sentinels (via an MCP-stdio crate such as `rmcp`); a final language choice is deferred to the Phase 1 Issue where the trade-off against Node/TypeScript (faster MCP ergonomics, divergence from family) can be evaluated against the spike findings. The forced-read benefit (tool descriptions in the system prompt) and the structural-binding benefit (PreToolUse hook validating intent) only co-exist when both an MCP tool surface and a hook gate are present, which rules out C. B leaves the observed decay problem unsolved. D imports a TypeScript codebase and a 17-tool catalog before we have evidence that any of it survives the subagent fan-out pattern unique to this environment.

### Consequences

- Good, because edit-kind metadata becomes capturable (foundation for Phase 2 expansions in gates and chronicler).
- Good, because the forced-read injection path is added without weakening any existing sentinel.
- Bad, because `sentinels` gains a new artifact type (MCP server), expanding the maintenance surface.
- Bad, because tool-description tokens permanently load 1-2k tokens into every session (cost is paid even when no Edit is invoked).
- Bad, because subagent fan-out behavior is unverified at decision time (see Open Questions).

### Confirmation

A weekly read of per-project `.declarator/state/edits.jsonl` (aggregated across active projects) for: (a) declaration-without-consumed-Edit ratio, (b) expired-ticket ratio, (c) per-kind selection distribution against a manual sample. Concrete thresholds for (a) and (b) are TBD after Phase 0 baseline data is collected. If either exceeds the agreed threshold for two consecutive weeks, the description ergonomics are wrong and reassessment fires.

## Pros and Cons of the Options

### A. New sentinel (declarator)

- Good, MCP descriptions are guaranteed to be re-read at every call; ticket binding gives PreToolUse hook structural authority.
- Good, edit log unlocks Phase 2 expansions in gates (kind-bound test selection) and chronicler (kind metadata).
- Bad, new MCP-server category in `sentinels` family; CI/release pipeline differs from the existing Rust hooks.
- Bad, subagent fan-out token race is unresolved at decision time.

### B. Status quo

- Good, zero new code; no new context cost.
- Bad, observed decay of CLAUDE.md/Skill discipline at high context utilization is unaddressed.
- Bad, no edit-kind metadata for postmortems or Phase 2 work.

### C. Description-only Skill

- Good, no MCP server, no ticket store, no new sentinel category.
- Bad, Skills only fire when the agent decides to invoke them; the forced-read property is weaker than MCP tool descriptions and the structural binding (hook gate on native Edit) is absent. The bet of the meta-edit pattern (tool surface, not text, changes behavior) is not actually tested.

### D. Fork meta-edit

- Good, 18 kinds and a hardened bash-write-bypass hook ship for free.
- Bad, imports a TypeScript codebase and a per-kind catalog tuned to the author's workflow before we know which kinds are load-bearing here.
- Bad, the subagent fan-out gap is inherited unverified, and the upstream has no maintenance commitment to closing it for us.

## More Information

### Architecture Diagram

```text
[agent intent]
    ↓
[mcp__declarator__declare_<kind>] ── writes ticket → state/grants/<token>.json
    ↓
[native Edit/Write/MultiEdit]
    ↓
[PreToolUse hook] ── reads grants, matches target_file, consumes ticket → state/edits.jsonl
    ↓
[edit lands]
```

### Quality Attributes

| Attribute       | Priority | Approach                                          |
| --------------- | -------- | ------------------------------------------------- |
| Forced read     | High     | MCP tool description (system prompt residence)    |
| Structural gate | High     | PreToolUse hook with file-based ticket validation |
| Observability   | Medium   | edits.jsonl with kind, target, rationale          |
| Token cost      | Low      | 3-6 kinds at MVP keep description budget under 2k |

### Trade-offs

`sentinels` family broadens from "stdio hooks only" to "MCP server + hook combo". Release cadence and dist format diverge per artifact. Accepted in exchange for the only known mechanism that delivers forced-read guarantees at edit time without diff inspection.

### Open Questions

- Subagent fan-out: parent-declares / child-edits is logically supported by file-based grants under the same project root, but unverified. Three options at adoption time: (a) accept and verify in Phase 0 spike, (b) defer adoption until verified, (c) constrain to non-fan-out workflows. Recommendation: (a).
- MCP-tool visibility from subagent definitions: subagents with restricted `allowed-tools` may not see `declare_*` tools, breaking child-only edits.
- Concurrent same-target subagents: ticket race needs target-level locking or fail-closed-on-multiple-grants policy.

### Phase 2 (deferred)

- G2 (gates extension): bind required test types to declared kind. Issue against `~/GitHub/cli/gates`.
- G3 (chronicler extension): include kind metadata in edit-detection records. Issue against `~/GitHub/cli/chronicler`.
- These are explicitly out of MVP. Recorded here so they are not silently absorbed into the `declarator` Issue.

### Reassessment Triggers

- Confirmation metrics breach for two consecutive weeks.
- Subagent fan-out spike (Phase 0) shows ticket race or visibility gap that cannot be resolved with file-locking or skill-local declare.
- MCP description token budget exceeds 4k as kinds are added.

### Related Issues (to be filed after acceptance)

| Repo                            | Scope                                                                     | Phase                                           |
| ------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| `~/GitHub/cli/declarator` (new) | MCP server + PreToolUse hook + edit log MVP (3 starting kinds, see below) | 1                                               |
| `~/GitHub/plugins/sentinels`    | Register declarator plugin into the marketplace once Phase 1 ships        | 1                                               |
| `~/GitHub/cli/gates`            | Kind-bound test selection (G2)                                            | 2 (deferred until Phase 1 reassessment trigger) |
| `~/GitHub/cli/chronicler`       | Kind metadata in edit detection (G3)                                      | 2 (deferred until Phase 1 reassessment trigger) |

Starting kinds for the Phase 1 MVP (subject to revision in the Phase 1 Issue based on baseline observation): `edit_refactor_only`, `edit_boundary_condition`, `edit_docs_only`. Rationale: the first covers the largest share of "minor change" self-classifications that decay catches, the second is the smallest concrete bug class with a sharp test obligation, the third unblocks the docs-batch workflow that meta-edit observed as the highest bypass-pressure surface.

### Spike Reference

`/tmp/declarator-spike/` contains the 110-LOC proof: `server.mjs` (MCP stdio, 1 tool), `hook.sh` (Bash PreToolUse, ticket validate + consume), passing 4/4 lifecycle tests on 2026-05-03.
