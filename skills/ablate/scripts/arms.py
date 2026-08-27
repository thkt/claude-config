#!/usr/bin/env python3
"""Arm command construction and run-count judgment for the ablate skill.

Not a CLI entry point: skills/ablate/SKILL.md imports this module for the constants and
functions below rather than shelling out to it (docs/wiki/deterministic-script-judgment.md
"閾値は script が持つ" — the arm count, the run count, and the pass threshold live here as
script constants, not as prose in SKILL.md).
"""

from __future__ import annotations

# The three arms an ablation run compares (skills/ablate's unit goal). Held as a tuple so a
# caller that needs "every arm" reads this constant instead of hand-copying the three names
# (docs/wiki/harness-production-divergence.md: the supply list is a runtime constant, not a
# prose contract).
WIPED = "wiped"
WIPED_PLUS_ONE = "wiped+1"
FULL_HARNESS = "full-harness"
ARMS = (WIPED, WIPED_PLUS_ONE, FULL_HARNESS)

# The headless invocation every arm starts from. --print puts the session in non-interactive
# mode and --output-format json gives a parseable result instead of a text transcript
# (verified against https://docs.claude.com/en/docs/claude-code/cli-reference).
BASE_COMMAND = ["claude", "--print", "--output-format", "json"]

# How many times one arm is run before its result counts as measured. 5 is a provisional
# floor against single-run noise; revisit once the first ablation run's variance is
# measured (see skills/scribe/scripts/triage.py's COMMIT_CAP for the same provisional shape).
RUN_COUNT = 5

# The share of an arm's runs that must reproduce the harness-present behavior for the arm to
# be judged passed. Held here per docs/wiki/deterministic-script-judgment.md so the number
# lives in one script constant rather than in SKILL.md prose; wiring it into a pass/fail
# verdict is deferred to the unit that scores run output, since that judgment needs a
# comparison this module does not yet have (see this unit's reported deferred list).
PASS_THRESHOLD = 0.8

UNMEASURED = "unmeasured"
MEASURED = "measured"


def arm_command(arm: str, element: str | None = None) -> list[str]:
    """The CLI command for one arm.

    wiped restricts settings loading to the project source alone (--setting-sources
    project), which is the ablation baseline. wiped+1 starts from that same baseline and
    restores exactly one harness element by appending it to the system prompt
    (--append-system-prompt), rather than reloading it through normal discovery — the
    contract this unit implements: "wiped は --setting-sources project",
    "復元は --append-system-prompt で作る". full-harness runs unmodified, with no
    restricting flag, as the upper-bound comparison point.
    """
    command = list(BASE_COMMAND)
    if arm in (WIPED, WIPED_PLUS_ONE):
        command += ["--setting-sources", "project"]
    if arm == WIPED_PLUS_ONE:
        if element is None:
            raise ValueError(f"arm {WIPED_PLUS_ONE!r} requires an element to restore")
        command += ["--append-system-prompt", f"[ablate] restoring element: {element}"]
    return command


def measurement_status(runs: int) -> str:
    """MEASURED once an arm has reached RUN_COUNT runs, otherwise UNMEASURED. Reads
    RUN_COUNT from the module namespace (not a captured default) so lowering the constant
    at runtime changes which already-collected run counts are reported as measured."""
    return MEASURED if runs >= RUN_COUNT else UNMEASURED
