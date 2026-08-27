---
status: "accepted"
date: "2026-08-28"
decision-makers: thkt
scope: [meta, workflows]
---

# Keep workflow enums in meta as a derived copy

## Context and Problem Statement

`rules/conventions/WORKFLOWS.md` (added alongside this DR) tells a `whenToUse` listing such as audit's `focus (a / b / ...)` to follow its script's own const (`FOCUS`, `MODES`) as a derived copy. `workflows/_lib/tests/meta-contract.test.js` was written to enforce that, and its own header comment states the reason in passing: the enum "survives that rule only because a caller cannot recover it at run time." Neither the rule nor the test explains, on its own, why the value has to live in prose at all instead of being read from the const directly, or when that constraint stops holding. This record answers both.

## Decision Drivers

- `meta.whenToUse` is read before a workflow runs, by whoever (today, the main loop) decides whether and how to invoke it
- A workflow script holds a top-level `return`, so it is neither ESM nor CommonJS; nothing can `import()` it to read `FOCUS` or `MODES` as live values (Script evaluation form, `rules/conventions/WORKFLOWS.md`)
- DRY (`rules/PRINCIPLES.md`) merges a copy only when a single edit can update every instance; Single Source of Truth (`rules/core/BOUNDARIES.md`) governs the copies a merge cannot reach

## Considered Options

- Keep the enum values in `whenToUse` prose as a derived copy, held honest by a parsing test
- Generate `whenToUse` from the const at authoring time and stop testing it, trusting the author to regenerate on change
- Move the enum out of static prose into a runtime-queryable manifest the decision-time reader loads instead of the script
- Drop enumeration from `whenToUse` and point the reader at the script source

## Decision Outcome

Chosen option: "Keep the enum values in `whenToUse` prose as a derived copy, held honest by a parsing test", because the decision-time reader has no other channel to the const's values.

`meta.whenToUse` is consulted before the script runs, and the Script evaluation form rules out `import()` as a way to read `FOCUS` or `MODES` live at that point. The value list therefore has to be restated as static prose for the reader to see it in advance. That restatement is a copy DRY cannot merge away, so Single Source of Truth applies: the const stays canonical, and the copy in `whenToUse` carries a marker back to it, in the form of `meta-contract.test.js` reading both as source text and failing on any divergence.

### Consequences

- Good, because the pre-invocation reader keeps seeing valid option lists without executing the script
- Good, because a divergence between the const and the prose fails a named test (`meta-contract.test.js`) instead of surfacing only when a caller passes a stale value
- Bad, because the const still has two textual copies (script and mirror) plus one prose restatement per workflow, and every edit to `FOCUS` or `MODES` has to touch the prose in the same change to keep the test green

### Confirmation

- `node --test "workflows/**/tests/*.test.js"` passes `meta-contract.test.js`'s focus/mode divergence checks
- `rules/conventions/WORKFLOWS.md`'s "meta.description and whenToUse content" section names the const as canonical for any enumerated `whenToUse`

## Pros and Cons of the Options

### Keep the enum values in `whenToUse` prose as a derived copy

A static copy of the const's keys, kept in sync by a test that parses both sides as source text.

- Good, because it works within the Script evaluation form constraint without adding a build step
- Bad, because it is a manual copy: forgetting to update `whenToUse` when `FOCUS` or `MODES` changes is caught only at test time, not prevented at edit time

### Generate `whenToUse` from the const at authoring time

Write a script that reads the const and stamps the prose into `meta`, run once when the const changes.

- Good, because the prose can never drift from the const it was generated from
- Bad, because it is a second script reading a live const from a `.js` workflow file, which the Script evaluation form already rules out as a general capability; a generator would need its own, narrower parsing path duplicating what `meta-contract.test.js` already does, with no test left to catch a generator that silently stops running

### Move the enum out of static prose into a runtime-queryable manifest

Have the pre-invocation reader query a small JSON or similar sidecar the workflow keeps in sync with its const, instead of reading `meta.whenToUse` prose.

- Good, because a manifest is unambiguous to parse, unlike prose matched by regex
- Bad, because the pre-invocation reader today is prose-driven (a human or an LLM deciding whether to invoke), not a program consuming structured input; introducing a manifest format solves a problem this reader does not have

### Drop enumeration from `whenToUse` and point at the script source

Replace `focus (a / b / ...)` with a sentence such as "see `FOCUS` in `audit.js`".

- Good, because there is nothing to keep in sync, so the class of drift this DR is about disappears
- Bad, because the decision of whether/how to invoke happens before the script runs, and sending that decision to read the script source moves cost from a divergence test onto every single invocation

## More Information

### Reassessment Triggers

- The main loop stops passing `focus` and `mode` as invocation-time choices read from `whenToUse`, removing the reason the values must be visible before the script runs
- A means besides `meta` for presenting invocation-time choices to the caller becomes available, giving the pre-invocation reader a channel to the const that does not require a prose copy
