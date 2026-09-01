---
name: ablate
description: Removes one harness element at a time, reruns, and judges whether that element moves the result. Elements that do not move it are listed as delete candidates.
when_to_use: ablation, one-sided ablation, measuring a harness element's effect, listing delete candidates, harness ablation, which rules actually matter
allowed-tools: Read Write LS Bash(python3:*) Bash(claude:*)
model: opus
argument-hint: "[element path]"
---

# /ablate - one-sided harness ablation

Run from the repository root. Every number and criterion the verdict rests on lives in a script, never in this body (`docs/wiki/deterministic-script-judgment.md`).

| Criterion                                | Lives in                                                 |
| ---------------------------------------- | -------------------------------------------------------- |
| Arm list, run count, agreement threshold | `${CLAUDE_SKILL_DIR}/scripts/arms.py`                    |
| Verdict table                            | `${CLAUDE_SKILL_DIR}/scripts/verdict.py`                 |
| DR gate                                  | `${CLAUDE_SKILL_DIR}/scripts/dr_gate.py`                 |
| Measurement window, rare-by-design set   | `${CLAUDE_SKILL_DIR}/scripts/usage_counts.py`            |
| Trigger task per rule                    | `${CLAUDE_SKILL_DIR}/references/measurement-criteria.md` |

## Input

`$ARGUMENTS` is an element path narrowing the measurement to one element. Omitted, every element Phase 1 enumerates is measured.

## Phase 1: Enumerate

The command below prints the element list, one `{path, classification}` per element. When `$ARGUMENTS` is set, keep the one element whose path matches it.

```bash
python3 skills/_lib/harness_elements.py .
```

## Phase 2: Run the arms

For each element, look up its row in the table in `${CLAUDE_SKILL_DIR}/references/measurement-criteria.md` and take the Trigger task ID and the Task. An element with no row keeps `trigger_task` null in its observation.

For an element with a row, build the command with `arms.arm_command(arm, task, element, root)` for each arm in `arms.ARMS` and run it `arms.RUN_COUNT` times. For each wiped-arm run, read the transcript and mark True when it honors the element's directive, False when it does not. A run whose result cannot be read stays out of `runs`.

One observation per element, all written into one JSON array file.

| Key            | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| `path`         | The path from Phase 1                                            |
| `trigger_task` | The table's Trigger task ID, or null when the element has no row |
| `task_set`     | The Trigger task IDs run in this session                         |
| `runs`         | One True / False per wiped-arm run, readable runs only           |

## Phase 3: Report

Feed the observations JSON to the command below. `write_report` classifies each observation, holds back delete candidates a live DR governs, and folds in the fire counts from `usage_counts`. It writes `docs/audit/<YYYY-MM-DD>-<HHMMSS>-ablate.md` (UTC) in the section order of `${CLAUDE_SKILL_DIR}/templates/report-template.md`, and the command prints the written path.

```bash
python3 skills/ablate/scripts/report.py <observations.json>
```

## Output

This skill stops at the verdict. Removal is a separate run: hand the delete candidates to `docs/wiki/retire-rename-procedure.md`.

| Item              | Content                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| Report path       | The path `write_report` returned                                                   |
| Delete candidates | The report's Delete Candidates section, or that there are none                     |
| Unmeasured        | The `unmeasured` rows in Verdicts, with the reason (no table row, or too few runs) |
