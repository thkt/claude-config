#!/usr/bin/env python3
"""Per-element hook fire counting and last-used dating for the ablate skill.

Reads every session transcript under the transcripts root the caller passes (the running
side's `projects/` directory) and counts, per harness element, how many PreToolUse/PostToolUse
hook fires named it and the most recent date one did.

The measurement window and the rare-by-design set live here as script constants, never as
prose in SKILL.md (docs/wiki/deterministic-script-judgment.md).
"""

from __future__ import annotations

import json
import re
import sys
from collections.abc import Iterator
from datetime import date, datetime
from pathlib import Path, PurePosixPath
from typing import TypedDict

from arms import UNMEASURED
from verdict import DELETE_CANDIDATE, NEEDS_HUMAN_JUDGMENT

# The plan's contract also names "hookSpecificOutput" records. No attachment sampled in this
# session carried that key, so reading it is deferred rather than guessed at.
FIRE_EVENTS = frozenset({"PreToolUse", "PostToolUse"})

# A `command` carries the lead-in the harness invoked it through: a path running through the
# .claude directory, or one starting from an unexpanded plugin variable. A harness element is
# named repo-root-relative, so without dropping that lead-in neither RARE_BY_DESIGN nor
# harness_elements' population matches a single key.
_CLAUDE_DIR_MARKER = "/.claude/"
_VARIABLE_PREFIX_RE = re.compile(r"^\$\{[A-Z_]+\}/")

# The suffixes that count as an element. Some fires carry a label instead of a path
# (measured in this session's transcripts: "formatter", "gates changed", "guardrails..."),
# and a label names no harness element, so it stays out of the tally.
ELEMENT_SUFFIXES = frozenset({".py", ".sh", ".js"})

# Safety nets exercised only on an uncommon input, where zero fires must not read as unused.
# hooks/security/rm_to_trash.py fires only when a destructive command is attempted ("Failure
# mode: fail-closed (security enforcement)"), so most sessions never trigger it.
RARE_BY_DESIGN: frozenset[str] = frozenset({"hooks/security/rm_to_trash.py"})

# How many days back from `now` a most-recent fire still counts as observed. Past this
# window an element reports as unmeasured, rather than keeping a stale last-used date alive.
MEASUREMENT_WINDOW_DAYS = 90


class ElementUsage(TypedDict):
    fires: int
    # ISO date (YYYY-MM-DD) of the most recent fire, or None when the element never fired.
    last_used: str | None


class UsageResult(TypedDict):
    elements: dict[str, ElementUsage]
    transcript_count: int
    date_range: dict[str, str | None]


def element_path(command: str) -> str | None:
    """The repo-root-relative path of the element `command` fired, or None when it names no
    element. An absolute path, or one still leading with an unexpanded variable, has no
    repo-root-relative form, so it too returns None."""
    text = command.strip()
    cut = text.find(_CLAUDE_DIR_MARKER)
    text = text[cut + len(_CLAUDE_DIR_MARKER) :] if cut != -1 else _VARIABLE_PREFIX_RE.sub("", text)
    if not text or text[0] in "~$/":
        return None
    if PurePosixPath(text).suffix not in ELEMENT_SUFFIXES:
        return None
    return text


def _parse_date(timestamp: str) -> date | None:
    """The calendar date a transcript timestamp ("2026-08-01T00:00:00.000Z") falls on, or
    None when the value does not start with an ISO date (one malformed record must not
    stop the read, matching report.py's per-line tolerance)."""
    try:
        return datetime.strptime(timestamp[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _iter_fires(path: Path) -> Iterator[tuple[str, date]]:
    """Yields (element_path, fire_date) once per PreToolUse/PostToolUse fire record in one
    transcript file. A malformed or incomplete record contributes nothing rather than
    raising: another process writes the transcript while this reads it, so a partial last
    line is expected."""
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(record, dict):
                continue
            attachment = record.get("attachment")
            if not isinstance(attachment, dict):
                continue
            if attachment.get("hookEvent") not in FIRE_EVENTS:
                continue
            command = attachment.get("command")
            timestamp = record.get("timestamp")
            if not isinstance(command, str) or not isinstance(timestamp, str):
                continue
            element = element_path(command)
            if element is None:
                continue
            fire_date = _parse_date(timestamp)
            if fire_date is None:
                continue
            yield element, fire_date


def count_usage(root: Path) -> UsageResult:
    """Scans every `*.jsonl` transcript under `root` and tallies fires per element. An
    element's key is the repo-root-relative path element_path returns."""
    transcripts = sorted(root.glob("**/*.jsonl"))
    elements: dict[str, ElementUsage] = {}
    fire_dates: list[date] = []

    for transcript in transcripts:
        try:
            fires = list(_iter_fires(transcript))
        except OSError:
            # One unreadable transcript must not stop the count over the rest.
            continue
        for element, fire_date in fires:
            entry = elements.setdefault(element, {"fires": 0, "last_used": None})
            entry["fires"] += 1
            if entry["last_used"] is None or fire_date.isoformat() > entry["last_used"]:
                entry["last_used"] = fire_date.isoformat()
            fire_dates.append(fire_date)

    if fire_dates:
        date_range: dict[str, str | None] = {
            "start": min(fire_dates).isoformat(),
            "end": max(fire_dates).isoformat(),
        }
    else:
        date_range = {"start": None, "end": None}

    return {
        "elements": elements,
        "transcript_count": len(transcripts),
        "date_range": date_range,
    }


# Read top to bottom; take the first row that matches. The order is load-bearing twice over:
# RARE_BY_DESIGN sits above the zero-fires row so a rare element never reaches
# DELETE_CANDIDATE, and the last_used check sits under `fires > 0` because zero fires always
# pairs with last_used=None, which a row above would swallow into UNMEASURED and leave
# DELETE_CANDIDATE unreachable.
#
# | Condition | Verdict |
# | --- | --- |
# | path is in RARE_BY_DESIGN | NEEDS_HUMAN_JUDGMENT |
# | fires > 0 and last_used is None (inconsistent input) | UNMEASURED |
# | fires > 0 and last_used falls outside MEASUREMENT_WINDOW_DAYS | UNMEASURED |
# | fires > 0 and last_used falls inside MEASUREMENT_WINDOW_DAYS | NEEDS_HUMAN_JUDGMENT |
# | fires == 0 | DELETE_CANDIDATE |
def classify(path: str, *, fires: int, last_used: str | None, now: date) -> str:
    """Assigns one element's usage observation a verdict, per the table above. Reads
    RARE_BY_DESIGN and MEASUREMENT_WINDOW_DAYS from the module namespace rather than as
    captured defaults, so patching either at run time changes the verdict returned."""
    if path in RARE_BY_DESIGN:
        return NEEDS_HUMAN_JUDGMENT
    if fires > 0:
        if last_used is None:
            return UNMEASURED
        if (now - date.fromisoformat(last_used)).days > MEASUREMENT_WINDOW_DAYS:
            return UNMEASURED
        return NEEDS_HUMAN_JUDGMENT
    return DELETE_CANDIDATE


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: usage_counts.py <transcripts-root>", file=sys.stderr)
        return 2
    result = count_usage(Path(argv[1]))
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
