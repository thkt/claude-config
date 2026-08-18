---
status: "accepted"
date: "2026-08-18"
decision-makers: "thkt"
---

# Replace 5 Whys with hypothesis elimination in root cause analysis

## Context and Problem Statement

`use-context-root-cause-analysis` walks a 5 Whys chain and returns Symptom, Root cause, and Pattern. Four callers depend on it: `/fix`'s Non-obvious path, reviewer-causation, enhancer-integration, and enhancer-evidence.

The technique contradicts rules this repository already applies. `rules/core/OPERATION.md` § Debug Investigation Protocol governs the same trigger `/fix` routes on, behavioral or intermittent bugs with an unclear cause, and asks for a diff against working similar code plus three or more hypotheses eliminated by testing. `rules/PRINCIPLES.md` lists "Single hypothesis" as a Strong Inference trigger. A 5 Whys chain carries one hypothesis per level by construction, so it sits on that trigger permanently. `/research` already invokes the OPERATION.md protocol; only `/fix` reaches for 5 Whys.

The chain also drifts. The skill's own worked example ends at "state is used imperatively" two levels past the actionable cause, and the skill's hint table admits the depth is nominal by telling the reader to stop once something is actionable.

Pattern, the field callers actually branch on, does not come from the chain at all. Isolated / Recurring / Systematic is decided by whether similar code sits nearby and whether the design is implicated, which is a survey of the surrounding code. Asking why five times does not produce it.

## Decision Drivers

- OPERATION.md and PRINCIPLES.md already prescribe a different method for the same trigger
- `/research` and `/fix` disagree on which method governs
- The output callers branch on is produced by a survey, not by the chain
- A single chain reaches a different answer depending on who asks

## Considered Options

- Option 1: Replace the method with OPERATION.md's protocol and make Pattern its own survey step
- Option 2: Keep 5 Whys and raise the skill's "list three or more candidates" hint into a step
- Option 3: Leave both and let each caller pick

## Decision Outcome

Option 1.

The skill name carries no technique, so the swap stays inside the body and the references. Callers keep referencing it by name, and the output fields are unchanged, so reviewer-causation, enhancer-integration, and enhancer-evidence need no edit.

Option 2 leaves the same instruction in two places and keeps the chain as the spine, which is the part that drifts. Option 3 keeps `/fix` and `/research` disagreeing.

The method is written into the skill rather than referenced, because the skill runs with `context: fork` and the always-loaded rules do not reach a forked context. OPERATION.md stays canonical and the skill says so.

### Confirmation

`skills/use-context-root-cause-analysis/SKILL.md` names no 5 Whys step, cites `rules/core/OPERATION.md` § Debug Investigation Protocol as the source of its method, and decides Pattern from a survey of the surrounding code.

## Consequences

- Good, because one method governs root cause across `/fix` and `/research`
- Good, because Pattern is decided by what actually determines it
- Bad, because the method now sits in both OPERATION.md and the skill, and a change to one has to reach the other
- Bad, because eliminating three hypotheses costs more than walking one chain

## More Information

The skill keeps `5 Whys` and `なぜなぜ分析` in `when_to_use`, so whoever types the old name still reaches root cause analysis. That mirrors how `/dr` keeps `ADR作成` after the rename to DR.

`references/symptom-patterns.md` survives unchanged in purpose: its symptom-to-cause table is where hypotheses come from.

Re-open this if eliminating three hypotheses proves too slow for the 1-3 file fixes `/fix` is scoped to, or if a caller needs the causal chain itself rather than the cause.

### References

- `rules/core/OPERATION.md` § Debug Investigation Protocol (the canonical method)
- `rules/PRINCIPLES.md` (Strong Inference, single-hypothesis trigger)
- ADR-0058 (inline single-consumer agent context skills into agents)
