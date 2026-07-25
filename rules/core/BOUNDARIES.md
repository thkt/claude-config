# Boundaries

For each principle in the Priority Matrix, define only the delta from its general definition (boundaries, thresholds, default corrections). General definitions are not restated here.

## Progressive Enhancement

Make it Work → Make it Resilient (when errors occur) → Make it Fast (when slowness measured) → Make it Flexible (when users request)

## Systems Thinking

A sum of local optima is not a global optimum. Judge a change by its impact on the whole system that carries the outcome, not by the locality it touches.

- A local metric can improve while the whole stays flat when the bottleneck is elsewhere. Identify the constraint before optimizing
- Repeated symptomatic shortcuts atrophy the capacity for fundamental solutions (Shifting the Burden). Before choosing a fix, judge whether it reduces the need for the fundamental solution or merely defers it

## Readable Code

Write for your later self and one teammate who shares the context. If shrinking the code makes it read easier, that is refinement; pursue it. If shrinking leaves code only you can decode, revert it. Carry intent in names, types, and test names, and treat comments as the last resort for the why and why-not code cannot hold. Review each comment you write against ../conventions/PROSE.md § Delete Redundant Sentences and delete any line that merely restates the code below it. When a why-not holds, keep that alone rather than pairing it with the why.

## DRY

- When one change forces all instances to change, it is the same knowledge, so apply DRY
- When each copy could evolve independently, it is merely similar code, so do not merge

## Single Source of Truth

DRY decides whether two copies are the same knowledge; Single Source of Truth governs copies that a merge cannot eliminate (translation mirrors, generated files, distributed copies).

- Resolve a mergeable copy with DRY, and keep it out of this management
- When a copy must remain, designate exactly one canonical source and mark the copy with where the canonical lives
- Edit the canonical, and let derived copies follow by generation or by mirroring in the same change unit

## YAGNI Boundary

YAGNI prohibits unneeded features and speculative code paths. It does not prohibit choosing better structure at equal cost. Occam's Razor > YAGNI Boundary.

- Open the abstraction gate when call sites are >= 2, or the domain is obvious like auth, logging, or error handling
- When cost measured by line count, indirection depth, and import count is equal, prefer fewer coordinated call sites

## Reuse Ordering

After understanding the problem and before writing code, work through these top to bottom. If a higher rung holds, do not drop to a lower one. When two options are the same size, pick the one that is correct on edge cases. Reducing how much you write never drops validation, error handling, security, or accessibility.

1. Don't build what isn't needed. Skip a speculative need
2. Reuse an existing helper / util / pattern in this codebase
3. Reach for the standard library before hand-rolling
4. Use a native platform feature. `<input type="date">` over a picker, CSS over JS, DB constraint over app code
5. Use an installed dependency. No new dep for what a few lines do
6. Write new code only when nothing above fits. Keep it the minimum that works

## Strong Inference

When two fixes under the same assumption have failed, switch from fixing the error (single-loop) to questioning the assumption itself (double-loop). Verbalize the governing assumption before forming the next hypothesis.

## Measurement

Outcomes need observable signals to detect drift.

- Combine result indicators (what changed) with process indicators (what was done) to resist metric gaming.
- Indicators serve the outcome, so if a number improves while the outcome does not, the indicator is wrong.
- Too many indicators dilute attention, so keep them thin enough to read at a glance.

## SOLID

Premature interfaces add indirection without value, so consider adding an interface only when a 2nd implementation appears.

## Overeagerness

Concretizes AI-Assisted Development. Keep to what the task requires, without overimplementing extra files, unrequested abstractions, or defensive code. See YAGNI and Occam's Razor.

| Trap                    | Rule                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Unrequested scope       | A bug fix does not clean surrounding code. A small feature does not add config           |
| Docs on untouched code  | Add comments/types only to code you changed, only where logic is non-obvious             |
| Defensive code          | Validate at system boundaries (user input, external APIs). Do not guard impossible cases |
| Speculative abstraction | No helpers or abstractions for one-time use or hypothetical future requirements          |
| Structure invention     | Split decisions are the user's; directory structure follows existing                     |
