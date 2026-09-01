#!/usr/bin/env python3
"""Arm command construction and run judgment for the ablate skill.

Not a CLI entry point: skills/ablate/SKILL.md imports this module for the constants and
functions below rather than shelling out to it (docs/wiki/deterministic-script-judgment.md
"閾値は script が持つ" — the arm count, the run count, and the pass threshold live here as
script constants, not as prose in SKILL.md).
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

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

# How many runs of the wiped arm judge_runs needs before it returns a verdict. 5 is a
# provisional floor against single-run noise; revisit once the first ablation run's variance
# is measured (see skills/scribe/scripts/triage.py's COMMIT_CAP for the same provisional
# shape).
RUN_COUNT = 5

# The share of the wiped arm's runs that must agree before judge_runs sets compliance either
# way. Below it the runs are noise, and judge_runs returns None so the element reads as
# unmeasured rather than as a verdict picked from a split.
PASS_THRESHOLD = 0.8

UNMEASURED = "unmeasured"


def arm_command(arm: str, task: str, element: str | None = None, root: Path | None = None) -> list[str]:
    """The CLI command for one arm, with `task` as the prompt.

    wiped restricts settings loading to the project source alone (--setting-sources
    project), which is the ablation baseline. wiped+1 starts from that same baseline and
    restores exactly one harness element by appending the file's text to the system prompt
    (--append-system-prompt), rather than reloading it through normal discovery, so the
    element under test is the only difference between the two arms. full-harness runs
    unmodified, with no restricting flag, as the upper-bound comparison point.
    """
    command = list(BASE_COMMAND)
    if arm in (WIPED, WIPED_PLUS_ONE):
        command += ["--setting-sources", "project"]
    if arm == WIPED_PLUS_ONE:
        if element is None or root is None:
            raise ValueError(f"arm {WIPED_PLUS_ONE!r} requires an element to restore and its root")
        restored = (root / element).read_text(encoding="utf-8")
        command += ["--append-system-prompt", f"# {element}\n\n{restored}"]
    command.append(task)
    return command


def judge_runs(runs: Sequence[bool]) -> bool | None:
    """Folds one wiped arm's per-run compliance into the `complies` value verdict.classify
    takes. Reads RUN_COUNT and PASS_THRESHOLD from the module namespace (not captured
    defaults) so lowering either at runtime changes which run lists get a verdict.

    | Condition                                    | Result |
    | -------------------------------------------- | ------ |
    | fewer than RUN_COUNT runs                    | None   |
    | share of True runs >= PASS_THRESHOLD         | True   |
    | share of False runs >= PASS_THRESHOLD        | False  |
    | Anything else (the runs disagree)            | None   |
    """
    if len(runs) < RUN_COUNT:
        return None
    share = sum(1 for run in runs if run) / len(runs)
    if share >= PASS_THRESHOLD:
        return True
    if 1 - share >= PASS_THRESHOLD:
        return False
    return None
