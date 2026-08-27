#!/usr/bin/env python3
"""Verdict classification for one observed arm element in the ablate skill.

Not a CLI entry point: skills/ablate/SKILL.md imports this module for the constants and
`classify` below rather than shelling out to it (docs/wiki/deterministic-script-judgment.md
"入力から一意に決まる判定は script に置く" — the decision table lives here as a script
function, not as prose in SKILL.md).
"""

from __future__ import annotations

from arms import UNMEASURED

# Read top to bottom; take the first row that matches, mirroring
# skills/census/SKILL.md Phase 4 Step 1's "上から読んで最初に当たった行を採る" table. This
# unit's contract places no `keep` row: an element is never reported as safe to keep as-is,
# only as a delete candidate, needing a human value judgment, or unmeasured.
#
# | Condition                                                     | Verdict              |
# | -------------------------------------------------------------- | --------------------- |
# | trigger_task is unset, task_set is unset, or trigger_task is   | UNMEASURED            |
# | absent from task_set                                          |                       |
# | complies is True                                               | DELETE_CANDIDATE      |
# | complies is False                                              | NEEDS_HUMAN_JUDGMENT  |
# | Anything else (compliance not yet observed)                    | UNMEASURED            |
DELETE_CANDIDATE = "delete-candidate"
NEEDS_HUMAN_JUDGMENT = "needs-human-judgment"


def classify(
    trigger_task: str | None = None,
    task_set: set[str] | None = None,
    complies: bool | None = None,
) -> str:
    """Assign one arm element's observation to DELETE_CANDIDATE, NEEDS_HUMAN_JUDGMENT, or
    UNMEASURED, per the table above. An element whose triggering task never ran in this
    task set carries no observation at all, so that row is checked first and wins over
    whatever `complies` says."""
    if task_set is None or trigger_task is None or trigger_task not in task_set:
        return UNMEASURED
    if complies is True:
        return DELETE_CANDIDATE
    if complies is False:
        return NEEDS_HUMAN_JUDGMENT
    return UNMEASURED
