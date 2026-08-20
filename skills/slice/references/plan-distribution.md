# Distributing a plan

Settle how each element of a plan reaches the slices' own Plan sections when the source already carries one. The point is to avoid running `/think` N more times: copy what copies, and rewrite only what differs per slice.

## First, look at how the units were cut

When the plan's units are cut per layer, a subset of units is not a slice. One slice would need part of several units, which distribution cannot produce. On finding that shape, stop distributing and hand it back to `/think` to be cut vertically instead. Judge it from the units' files: two or more units each confined to one of schema, API, or UI is the signal.

## What each element does

| Element             | How it travels                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Outcome             | Rewrite per slice. State the done state as of finishing that one slice                                           |
| root_cause          | Copy into the slice touching the cause, and only when the epic's title carries a `[Bug]` prefix                  |
| test_command        | Copy as is                                                                                                       |
| base                | Copy as is. Keep the name the same across every slice when they aggregate into an epic branch                    |
| reference_module    | Copy into the slices touching that module. Drop it from the ones that do not                                     |
| Rules               | Copy only the lines bearing on that slice's files. Copying the rest hands the implementing agent unrelated rules |
| Preconditions       | Copy only what exists in the current code                                                                        |
| U-NNN / T-NNN       | Renumber from 001 per slice. Id uniqueness is required within one plan, and that is all                          |
| Manual verification | Copy only the items verified in that slice                                                                       |
| Backlog candidates  | Leave on the epic. Copy them into no slice                                                                       |

## What a sibling slice creates is a dependency, not a precondition

Build's Revalidate matches each precondition against the current codebase before Code runs. A precondition naming a file another slice has yet to create fails Revalidate until that slice lands, and the reason it fails ("not there yet") is indistinguishable from a wrong plan.

Write it under Blocked by instead. It is the same treatment an acceptance criterion in that shape gets, and the ordering then travels as a dependency.

## Check the distribution by counting

Each slice's Plan has to stand on its own as something build accepts. Count these three.

1. The union of every slice's U-NNN covers the original plan's units exactly. An uncovered unit is what Phase 3 surfaces as the coverage check's uncovered line
2. Each unit holds 3 files or fewer and 4 tests or fewer. Only a seam unit sits outside those caps
3. At most one unit per slice carries `seam: true`
