# Assigning ids

Number the units and the acceptance tests. The shape is a `U-001` / `T-001` sequence, with T-NNN unique across the whole plan.

Build's Load stops a duplicate id at the id cross-check. A number that disagrees with the target repo's convention leaves the rename to implementation time.

| Target repo       | How to number                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Uses prefixed ids | Follow that convention as `T-SK077`, continuing from that prefix's repo-wide max                                         |
| Carries no prefix | Plan-wide uniqueness does not reach inside a single file, so skip the numbers already used in the file the tests land in |
