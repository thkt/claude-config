---
name: ablate
description: Removes one harness element at a time, reruns, and judges whether that element moves the result. Elements that do not move it are listed as delete candidates.
when_to_use: ablation, one-sided ablation, measuring a harness element's effect, listing delete candidates, harness ablation, which rules actually matter
allowed-tools: Read Write LS Bash(python3:*) Bash(claude:*)
model: opus
argument-hint: "[element path]"
---

# /ablate - one-sided harness ablation

## Input

`$ARGUMENTS` is an element path narrowing the measurement to one element. Omitted, every element Phase 1 enumerates is measured.

## Where the criteria and thresholds live

The arm list, the run count per arm, and the pass threshold are all constants in `${CLAUDE_SKILL_DIR}/scripts/arms.py`. The classification criteria live in `${CLAUDE_SKILL_DIR}/scripts/verdict.py`. The DR-gate criteria, the confirmed-unmet marker and where the records are read from, live in `${CLAUDE_SKILL_DIR}/scripts/dr_gate.py`. The measurement window and the rare-by-design set live in `${CLAUDE_SKILL_DIR}/scripts/usage_counts.py`. The per-rule trigger tasks and the fixed task set live in `${CLAUDE_SKILL_DIR}/references/measurement-criteria.md`. Do not copy a number into this body (`docs/wiki/deterministic-script-judgment.md`).

## Phase 1: Enumerate

Call `enumerate_elements(root)` in `skills/_lib/harness_elements.py` for the harness elements and each one's classification. When `$ARGUMENTS` names an element path, hand Phase 2 that one alone.

```bash
python3 -c 'import sys; sys.path.insert(0, "skills/_lib"); import harness_elements, json; print(json.dumps(harness_elements.enumerate_elements(".")))'
```

## Phase 2: Run the arms

For each element Phase 1 returned, and each arm in `arms.ARMS`, assemble the command `arms.arm_command(arm, element)` returns and run it `arms.RUN_COUNT` times. Take that element's triggering task from `${CLAUDE_SKILL_DIR}/references/measurement-criteria.md`. Build one observation for that element out of the run results.

| Situation                                     | Treatment                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| The run count falls short of `arms.RUN_COUNT` | Proceed with `arms.measurement_status(runs)` still returning `unmeasured`     |
| The element `wiped+1` restores is unsettled   | `arm_command` stops with ValueError, so settle the element before calling it  |
| A run fails and its result cannot be read     | Leave that run uncounted and put only the runs that landed in the observation |

## Phase 3: Report

Call `report.write_report(root, observations)`. Before a delete candidate reaches the report, `dr_gate.gate` reads `docs/decisions/` and holds back any element a live record governs, so the Summary counts them apart. It also runs `usage_counts.py` and folds each element's fire count and last-used date into the same Harness Elements table, so there is one route to see them, not a second one running alongside it. It writes to `docs/audit/` by default, naming the file `<YYYY-MM-DD>-<HHMMSS>-ablate.md` in UTC, in the section order `${CLAUDE_SKILL_DIR}/templates/report-template.md` carries.

```bash
python3 -c 'import sys; sys.path.insert(0, "skills/ablate/scripts"); sys.path.insert(0, "skills/_lib"); import report, json, pathlib; print(report.write_report(pathlib.Path("."), json.load(sys.stdin)))' < <observations.json>
```

## Output

| Item              | Content                                                           |
| ----------------- | ----------------------------------------------------------------- |
| Report path       | The path `write_report` returned                                  |
| Delete candidates | The report's Delete Candidates section, or that there are none    |
| Measured count    | Rows in Verdicts that are not `unmeasured`                        |
| Usage             | Each element's fire count and last-used date, in Harness Elements |

Removing anything the report names is a separate run: hand the delete candidates to `docs/wiki/retire-rename-procedure.md`, which owns the detection layer a retirement loses and the trigger for reviving it. This skill stops at the verdict.
