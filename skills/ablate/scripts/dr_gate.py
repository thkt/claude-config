#!/usr/bin/env python3
"""DR cross-reference gate for delete candidates in the ablate skill.

DR lookup and the hold/pass decision live here as a script function, never as prose in
SKILL.md (docs/wiki/deterministic-script-judgment.md).

The lookup searches DR bodies for the path text because no DR maps a path to itself through
any machine-readable field yet.
"""

from __future__ import annotations

import re
from pathlib import Path

from verdict import DELETE_CANDIDATE

# Returned in place of the input verdict when a delete candidate traces to a DR whose
# Reassessment Triggers carry no confirmation record. Kept out of verdict.py: this is
# dr_gate's own outcome, not a fourth verdict.classify can return.
HELD = "held"

# Handed to Path.glob unexpanded, never hand-copied as an expanded file list
# (docs/wiki/path-reference-audit.md).
_DR_GLOB = "docs/decisions/*.md"

# The section this gate reads for a confirmation record. Both "## " and "### " occur across
# docs/decisions/*.md depending on the DR's heading depth, so the pattern matches either.
_TRIGGERS_HEADING = re.compile(r"^#{2,3}\s+Reassessment Triggers\s*$", re.MULTILINE)

# A line reading "Confirmed unmet: {date}" states that someone already checked the
# Reassessment Triggers and found them not yet met.
_CONFIRMED_UNMET = re.compile(r"^Confirmed unmet:", re.MULTILINE)


def _find_governing_dr(path: str, root: Path) -> tuple[Path, str] | None:
    """The first _DR_GLOB match under `root` whose body mentions `path`, paired with that
    body's text, or None when no DR mentions it. Returns the text alongside the path so a
    caller reading the matched DR's body does not open the same file a second time."""
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
    """Read top to bottom; take the first row that matches. This gate only ever holds a
    delete candidate back; every other verdict passes through untouched.

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
