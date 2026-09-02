# Prompt Quality Checks

The detection tables reviewer-prompt applies in its Phase 1 (Token Efficiency) and Phase 2 (Structure). Phase 3 and Phase 4 stay in the agent body.

## Phase 1: Token Efficiency

| Pattern                                                         | Action                          |
| --------------------------------------------------------------- | ------------------------------- |
| 3+ lines prose with parallel attributes                         | REPORT, table candidate         |
| Same concept stated 3+ times in file                            | REPORT, redundancy              |
| Filler: "It is important to", "In order to", "Please make sure" | REPORT, cut                     |
| Trailing summary restating content above                        | REPORT, cut                     |
| Same concept stated twice for emphasis                          | SKIP, intentional reinforcement |

## Phase 2: Structure

Threshold 3+ parallel items. 2 items in prose is acceptable.

| Pattern                                   | Suggested structure              |
| ----------------------------------------- | -------------------------------- |
| Bullet list with consistent key-value     | Table with key/value cols        |
| Sequential filters/rules as prose         | Table with condition/action cols |
| Comparison/contrast in prose              | Table with option columns        |
| Inline conditions with actions            | Decision table                   |
| Numbered list without ordering dependency | Table (order not semantic)       |
