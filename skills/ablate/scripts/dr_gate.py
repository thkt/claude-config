#!/usr/bin/env python3
"""DR cross-reference gate for delete candidates in the ablate skill.

Not a CLI entry point: skills/ablate/SKILL.md imports this module for the constant and
`gate` below rather than shelling out to it (docs/wiki/deterministic-script-judgment.md
"入力から一意に決まる判定は script に置く" — DR lookup and the hold/pass decision live here
as a script function, not as prose in SKILL.md).

This unit (issue #485 U-001) follows skills/census/SKILL.md Phase 3's DR cross-reference:
look up the DR that governs a given element path, then decide whether a delete candidate
traceable to that DR may pass verdict.classify's judgment through unchanged. DR lookup is a
literal path search across docs/decisions/*.md under `root` — no DR maps a path to itself
through any machine-readable field yet, so grepping the DR body for the path text is the
mechanical substitute census Phase 3's candidate-to-DR cross-reference reduces to here.
"""

from __future__ import annotations

import re
from pathlib import Path

from verdict import DELETE_CANDIDATE

# Returned in place of the input verdict when a delete candidate traces to a DR whose
# Reassessment Triggers carry no confirmation record. Distinct from verdict.py's own
# constants: this is dr_gate's own outcome, not one of verdict.classify's three.
HELD = "held"

# A DR governs a path when the path text appears literally inside the DR body (the
# mechanical stand-in named in this module's docstring; no DR field maps a path to itself).
# docs/wiki/path-reference-audit.md: this glob is left unexpanded here and handed to
# Path.glob, never hand-copied as an expanded file list.
_DR_GLOB = "docs/decisions/*.md"

# The section this gate reads for a confirmation record. Both "## " and "### " occur across
# docs/decisions/*.md depending on the DR's heading depth, so the pattern matches either.
_TRIGGERS_HEADING = re.compile(r"^#{2,3}\s+Reassessment Triggers\s*$", re.MULTILINE)

# This unit's own convention (see the module docstring on machine-readable DR fields): a
# line reading "Confirmed unmet: {date}" inside the DR file states that someone already
# checked the Reassessment Triggers and found them not yet met.
_CONFIRMED_UNMET = re.compile(r"^Confirmed unmet:", re.MULTILINE)


def _find_governing_dr(path: str, root: Path) -> tuple[Path, str] | None:
    """The first _DR_GLOB match under `root` whose body mentions `path`, paired with that
    body's text, or None when no DR mentions it (also None, via the empty glob result, when
    docs/decisions/ is absent). Returns the text alongside the path so a caller that goes on
    to read the matched DR's body does not open the same file a second time."""
    for dr_path in sorted(root.glob(_DR_GLOB)):
        text = dr_path.read_text(encoding="utf-8")
        if path in text:
            return dr_path, text
    return None


def _confirmed_unmet(dr_text: str) -> bool:
    """True when the DR's Reassessment Triggers section is followed by a confirmation
    record before the next heading (or the end of the file)."""
    heading = _TRIGGERS_HEADING.search(dr_text)
    if heading is None:
        return False
    next_heading = re.search(r"^#{1,6}\s+\S", dr_text[heading.end() :], re.MULTILINE)
    section_end = heading.end() + next_heading.start() if next_heading else len(dr_text)
    section = dr_text[heading.end() : section_end]
    return _CONFIRMED_UNMET.search(section) is not None


def gate(path: str, verdict: str, root: Path) -> str:
    """Read top to bottom; take the first row that matches, the same shape verdict.py carries
    from skills/census/SKILL.md Phase 4 Step 1. This gate only ever holds a delete candidate
    back; every other verdict passes through untouched.

    | Condition                                                   | Result   |
    | ----------------------------------------------------------- | -------- |
    | verdict is not DELETE_CANDIDATE                             | verdict  |
    | no DR governs path                                          | verdict  |
    | the governing DR records its triggers confirmed unmet       | verdict  |
    | Anything else (a live DR governs the path)                  | HELD     |
    """
    if verdict != DELETE_CANDIDATE:
        return verdict
    found = _find_governing_dr(path, root)
    if found is None:
        return verdict
    _, dr_text = found
    if _confirmed_unmet(dr_text):
        return verdict
    return HELD
