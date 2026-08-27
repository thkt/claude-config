# Ablation Report Template

The section skeleton `/ablate`'s `${CLAUDE_SKILL_DIR}/scripts/report.py` `_render` emits: which sections appear and in what order. Every table's columns and every Summary row label come from the `_table` calls inside `_render`, so this file names neither. A copy of them here goes stale on the next column `_render` gains, with nothing to catch it.

When `_render` finds no delete candidates, it writes `No delete candidates.` in place of that section's list.

## Template

```markdown
# Ablation Report

## Summary

<one row per metric _render counts>

## Always-Loaded Elements

<one row per line enforcer_map classified>

## Harness Elements

<one row per element harness_elements enumerated>

## Arms

<one bullet per arm>

## Verdicts

<one row per observed element>

## Delete Candidates

<one bullet per surviving candidate>
```
