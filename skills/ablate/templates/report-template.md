# Ablation Report Template

The skeleton that `/ablate`'s `${CLAUDE_SKILL_DIR}/scripts/report.py`'s `_render` emits. Each table's column definitions are held by the `_table` calls inside `_render`; this skeleton does not repeat them. Read `_render` for the headers and their order.

When `_render` detects no delete candidates, it writes `No delete candidates.` for that section.

## Template

Substitute `{...}` from the report data. The four table sections below (Summary, Always-Loaded Elements, Harness Elements, Verdicts) are each generated once.

```markdown
# Ablation Report

## Summary

| Metric                        | Value |
| ----------------------------- | ----- |
| Harness elements enumerated   | {N}   |
| Arms                          | {N}   |
| Elements observed             | {N}   |
| Delete candidates             | {N}   |
| Always-loaded lines mapped    | {N}   |
| Held by a live DR             | {N}   |

## Always-Loaded Elements

| File      | Line | Verdict | Enforcer |
| --------- | ---- | ------- | -------- |
| {file}    | {N}  | {verb}  | {name}   |

## Harness Elements

| Path   | Classification |
| ------ | -------------- |
| {path} | {class}        |

## Arms

- {arm}

## Verdicts

| Path   | Verdict |
| ------ | ------- |
| {path} | {verb}  |

## Delete Candidates

- {path}
```
