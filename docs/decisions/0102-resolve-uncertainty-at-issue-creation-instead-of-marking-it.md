---
status: "accepted"
date: "2026-08-19"
decision-makers: "thkt"
---

# Resolve uncertainty at issue creation instead of marking it

## Context and Problem Statement

`/issue` records three kinds of uncertainty. Confidence marking puts `(tentative: <action at pickup>)` inline on a judgment the user left open and on an unverified fact. The Premises section of the feature and bug templates holds a premise the work depends on. `build.js` collects both into `assumptions`, and Ship renders them on the draft PR as the user's veto targets.

A marked issue defers the decision rather than settling it. Whoever picks the work up meets a guess that reads as a requirement, and the marker only tells them to check it. The check has no owner and no deadline: the PR veto fires after the implementation is written, which is the most expensive moment to overturn a premise.

Two of the three kinds are settleable when the issue is written. An open judgment is a question for the user, and an unverified fact is a Read or a search. The third kind, a premise that is true now and may go stale, is already covered elsewhere: the plan's `### 前提` becomes `preconditions` in the plan schema, and build's Revalidate stage re-checks each `{path, pattern}` against the current codebase before Code runs. That check is deterministic, whereas a Premises line saying "re-check before pickup" is prose nobody is accountable for.

## Decision Drivers

- An issue that records a guess moves the decision to the most expensive point to reverse it
- An open judgment and an unverified fact are both settleable while the issue is being written
- Staleness is already guarded by `preconditions` plus Revalidate, deterministically
- `Premises` and the plan's `前提` are the same knowledge, and `duplication-match.md` already says so

## Considered Options

- Option 1: Remove confidence marking and Premises, and settle both kinds during Phase 1
- Option 2: Keep confidence marking, remove Premises alone
- Option 3: Keep both and tighten the criteria for what earns a marker

## Decision Outcome

Option 1.

Phase 1's body generation settles an open judgment through AskUserQuestion and an unverified fact through Read or a search, rather than writing either into the body. The `## Premises` section leaves the feature and bug templates. `assumptions` leaves the plan schema, the extract prompt, Ship's rendering, and the tail translation in `build.js`; `preconditions` stays and keeps Revalidate's guard intact.

Option 2 leaves the marker as the escape hatch that makes settling optional. Option 3 keeps a mechanism whose value depends on the writer choosing not to use it.

### Confirmation

`skills/issue/SKILL.md` carries no confidence-marking section, none of the four templates writes `(tentative:`, and `workflows/build.js` has no `assumptions` field. `preconditions` still reaches Revalidate.

## Consequences

- Good, because the issue body carries only what somebody decided, so a reader cannot mistake a guess for a requirement
- Good, because the surviving staleness guard is machine-checked rather than a prose reminder
- Bad, because the draft PR loses its assumptions section, and with it the place a user overturned a guess late
- Bad, because a premise that cannot be verified at creation, such as an external API's response, has no slot and has to block the filing or move into Constraints as a settled fact

## More Information

This supersedes two lines rather than two decisions. ADR-0084 kept confidence marking as the upstream of build's `assumptions` extraction while it retired the issue gates; that line declared the mechanism out of scope for the restructuring rather than arguing for it. ADR-0078 catalogued `issue=preview の tentative/critic マーカー` as a producer-specific top-level output; the critic marker is unaffected.

`/challenge` states its own assumptions in `VERDICT_SCHEMA` and proceeds on the reversible ones. That does not collide with this decision, because Phase 2 of `/issue` already keeps the verdict and its findings out of the body.

### Reassessment Triggers

- Filing stalls repeatedly because a premise cannot be verified at creation and has nowhere to go
- A caller needs a late override of a guess on the PR, which the removed assumptions section provided
- Revalidate stops covering staleness, for instance because plans stop recording `preconditions`

### References

- ADR-0084 (retired the issue gates; kept confidence marking as build's upstream)
- ADR-0078 (finding atom family; catalogued the tentative marker)
- `skills/issue/references/duplication-match.md` (Premises and the plan's preconditions are the same knowledge)
