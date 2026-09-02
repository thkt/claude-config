# Finding Disposition and Calibration

What the reader does with a finding, and which findings get reported at all. The field definitions live in `finding-schema.md`.

## Disposition

Severity states how large the impact is. Disposition states what the reader does next. Whether a finding blocks a merge or is left to the author is an axis severity does not answer, so the two ride on one finding together.

"Severity it rides with" is a guide, not a derivation rule. The default is pinned to must rather than derived from severity. `workflows/assert.js`'s gate ignores severity and returns NotReady on `issues.length > 0` alone, so a severity-derived default would put nits on a finding that blocks the merge. The vocabulary stays on the audit side and does not return to `/preview`, which `skills/preview/tests/plan-alignment.test.js` forbids.

| Value | Meaning                                  | Severity it rides with | Supplied by                        |
| ----- | ---------------------------------------- | ---------------------- | ---------------------------------- |
| must  | Fix before merge                         | critical / high        | the script default, or the 3       |
| want  | Fix unless there is a reason not to      | medium                 | the 3 reviewers below              |
| imo   | The author decides                       | low                    | the 3 reviewers below              |
| nits  | Cosmetic. Fixing it is optional          | low                    | the 3 reviewers below              |
| ask   | Undecidable from code alone. Ask a human | none                   | the critic's needs_context verdict |
| info  | Already handled. Kept for the record     | none                   | triage's disputed / downgraded     |

| Rule           | Content                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Default        | must. The script sets it on a finding the reviewer did not declare                                             |
| Declarable     | must / want / imo / nits. ask and info are not kinds a reviewer produces                                       |
| Who overrides  | reviewer-design / reviewer-readability / reviewer-reuse only, the lenses whose findings can turn on preference |
| Override needs | A disposition_reason. An override without one falls back to the default must                                   |
| Merge order    | must > want > imo > nits. A merged finding takes the strongest value among its sources                         |
| Gates          | Disposition feeds no gate. It is the order to fix in, not the call on whether to merge                         |

## Calibration Filters

Apply in order. If any filter excludes, do not report.

| Filter              | Question                                                        | Exclude when                                       |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| Senior Engineer     | Would a senior engineer request a change?                       | "Depends on preference" or "wouldn't block the PR" |
| Harm                | Concrete trigger for bug/data loss/security/maintenance burden? | Cannot name one                                    |
| Fix Proportionality | Fix proportional to risk?                                       | Significant refactoring for low-severity issue     |

### Context Test

Each reviewer's own `## Calibration` heading points at its REPORT/SKIP examples under `calibration/`. When uncertain, prefer SKIP. The challenger exists to catch false negatives, but false positives waste pipeline capacity.

| Context         | Action                                                            |
| --------------- | ----------------------------------------------------------------- |
| Cold path       | Exclude unless severity >= high                                   |
| Intentional     | Code comments, error messages, or naming suggest intent → exclude |
| Framework idiom | Follows framework/library convention → exclude                    |
| Indirect cover  | Tested through caller or integration test → exclude (TC)          |
| Semantic differ | Structurally similar but different business logic → exclude (DRY) |

## Memory Usage

critic-design and reviewer-security declare `memory` in their frontmatter and use agent-memory within the boundary below. critic-audit owns the false-positive verdict, which lands in the record as disputed. Therefore the reviewer reports every finding it discovers, including patterns reported and accepted in past runs. The fact that a pattern is known feeds the severity judgment.

| Use                                               | Allowed |
| ------------------------------------------------- | ------- |
| Severity judgment material (actor, threat model)  | Yes     |
| Pre-report re-check steps (grep, verify commands) | Yes     |
| Whether to report a finding                       | No      |
