---
status: "accepted"
date: 2026-04-20
decision-makers: thkt
---

# Replace /scout skill with scout-search CLI wrapper, retire scouting-anomalies

## Context and Problem Statement

`/scout` skill was a wrapper around the `scouting-anomalies` skill (file-by-file read-through diagnostic), designed in session `5bcba14e` (2026-04-15). Two issues surfaced during 2026-04-20 cleanup:

| Issue               | Detail                                                                                                                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Namespace collision | `scout` CLI (`/opt/homebrew/bin/scout`) provides Web search, page fetch, GitHub repo exploration - shipped via `brew install thkt/tap/scout`. `/scout` skill had no relation to that CLI, breaking the mental model established by sibling `yomu-search` / `recall-search` skills (each wraps its namesake CLI) |
| Dead skill          | recall search across 11,260 sessions found no invocation of `scouting-anomalies` or `/scout` outside the original design discussion (2026-04-15) and two later meta-discussions (2026-04-17 cleanup, 2026-04-20 rename). Read-through diagnostic never produced a staging entry in production                   |

Meanwhile, `scout` CLI was not surfaced as a skill, so neither humans nor the LLM had a discoverable wrapper that matched the `yomu-search` / `recall-search` pattern.

## Decision Drivers

- Sibling consistency: `yomu-search` wraps `yomu` CLI, `recall-search` wraps `recall` CLI. `scout-search` wrapping `scout` CLI completes the triad
- Empirical non-use: scouting-anomalies has zero production invocations after 5 days of availability
- Namespace hygiene: `/scout` slash command pointing to an internal wrapper collides with the `scout` CLI binary the user already runs via shell
- Reversibility: git history + `~/.Trash/` preserve scouting-anomalies + templates/scout if read-through diagnostic is revived

## Considered Options

### A: Keep both - rename `/scout` skill to `/read-through`, add `scout-search` separately

Retain scouting-anomalies and its wrapper under a new name. Add `scout-search` for CLI access.

- Good: Preserves read-through diagnostic capability without loss
- Good: No behavior change for users who discovered `/scout` (none found)
- Bad: Keeps a skill with zero empirical usage as LLM matching noise
- Bad: Requires extra documentation to explain why `scout-search` and `/read-through` both exist

### B: Retire scouting-anomalies + templates/scout, add scout-search (adopted)

Delete the read-through skill and its staging template. Create `scout-search` as the canonical scout CLI wrapper.

- Good: Namespace aligns with yomu-search / recall-search pattern
- Good: Removes dead skill from LLM matching candidates
- Good: Fully reversible via git history + `~/.Trash/`
- Bad: Read-through diagnostic capability removed (acceptable - never used)
- Bad: Original design intent (institutionalize read-through as a diagnostic) unmet - deferred until demand surfaces

### C: Only add scout-search, leave `/scout` + scouting-anomalies as-is

Add the new skill without touching the existing one.

- Good: Zero risk of regressing an existing capability
- Bad: Namespace collision persists (`/scout` skill ≠ `scout` CLI)
- Bad: Dead skill continues to pollute LLM matching
- Bad: Defers the decision with no new information to be gained

## Decision Outcome

Adopted option B. The sibling-consistency benefit plus empirical non-use of scouting-anomalies outweighs the loss of a capability that never left the design stage. If read-through diagnostic becomes load-bearing later, it can be resurrected from git history and redesigned without the namespace collision.

## Consequences

### Positive

- `scout-search` joins `yomu-search` + `recall-search` as a consistent CLI-wrapper triad (frontmatter shape, command table layout, prerequisites section)
- `/scout` slash command namespace is freed (available if scout CLI ever needs a user-invocable shortcut)
- LLM skill-matching surface reduced by one dead skill

### Negative

- Read-through diagnostic as a formal skill is gone; ad-hoc read-through still possible via Read/Grep
- Users who memorized `/scout` (none identified) would see it removed

### Reassessment Triggers

Reconsider if any of the following occur:

| Trigger                                                                              | Action                                                                        |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Read-through diagnostic demand recurs in ≥2 separate sessions within 30 days         | Restore scouting-anomalies from git history, redesign with non-colliding name |
| scout CLI adds state-management subcommands requiring prerequisites like yomu-search | Expand scout-search Prerequisite section accordingly                          |
| `/scout` slash command is needed for CLI shortcuts                                   | Create thin user-invocable skill distinct from scout-search                   |

### Files

| Change  | Path                                      |
| ------- | ----------------------------------------- |
| Deleted | `skills/scout/SKILL.md`                   |
| Deleted | `skills/scouting-anomalies/SKILL.md`      |
| Deleted | `templates/scout/read-through-staging.md` |
| Added   | `skills/scout-search/SKILL.md`            |
