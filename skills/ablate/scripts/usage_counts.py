#!/usr/bin/env python3
"""Per-element hook fire counting and last-used dating for the ablate skill.

Reads every session transcript under `~/.claude/projects/**/*.jsonl` and counts, per
harness element, how many PreToolUse/PostToolUse hook fires named it and the most recent
date one did.

Not a CLI entry point: skills/ablate/SKILL.md imports this module for the constants and
functions below, mirroring arms.py / verdict.py's own docstring convention
(docs/wiki/deterministic-script-judgment.md — thresholds and the required set live here as
script constants, not as prose in SKILL.md).
"""

from __future__ import annotations

import json
import sys
from collections.abc import Iterator
from datetime import date, datetime
from pathlib import Path
from typing import TypedDict

from arms import UNMEASURED
from verdict import DELETE_CANDIDATE, NEEDS_HUMAN_JUDGMENT

# A real transcript records one hook fire as a top-level "attachment" object whose
# hookEvent names the event and whose command names the fired script (confirmed by reading
# a live ~/.claude/projects/**/*.jsonl transcript in this session: attachment.type
# "hook_success", attachment.hookEvent "PreToolUse", attachment.command
# "${CLAUDE_PLUGIN_ROOT}/hooks/context-gate.sh", sibling top-level "timestamp"). The
# contract also names "hookSpecificOutput" records; no attachment sampled in this session
# carried that key, so reading it is deferred rather than guessed at (see this unit's
# reported deferred list).
FIRE_EVENTS = frozenset({"PreToolUse", "PostToolUse"})

# Elements expected to fire rarely by their own design — a safety net exercised only on an
# uncommon input, not a frequently-run path — held as a script constant per
# docs/wiki/harness-production-divergence.md so the set is read, not hand-copied. Zero
# fires here must not read as "unused" (T-002). hooks/security/rm_to_trash.py fires only
# when a destructive command is attempted (skills/ablate/scripts/../../hooks/security/
# rm_to_trash.py: "Failure mode: fail-closed (security enforcement)"), so most sessions
# never trigger it.
RARE_BY_DESIGN: frozenset[str] = frozenset({"hooks/security/rm_to_trash.py"})

# How many days back from `now` a most-recent fire still counts as observed. Past this
# window, an element reports as unmeasured rather than keeping a stale last-used date alive
# (T-003; issue #487 Testing Decisions: "計測窓の定数を動かすと、未計測として報告される要素
# が変わることを固定する").
MEASUREMENT_WINDOW_DAYS = 90


class ElementUsage(TypedDict):
    fires: int
    # ISO date (YYYY-MM-DD) of the most recent fire, or None when the element never fired.
    last_used: str | None


class UsageResult(TypedDict):
    elements: dict[str, ElementUsage]
    transcript_count: int
    date_range: dict[str, str | None]


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
    transcript file. A line that fails to parse, or an attachment missing hookEvent /
    command / timestamp, contributes nothing rather than raising — a transcript is written
    by another process while this reads it, so a partial last line is expected, not
    exceptional."""
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
            fire_date = _parse_date(timestamp)
            if fire_date is None:
                continue
            yield command, fire_date


def count_usage(root: Path, now: date) -> UsageResult:
    """Scans every `*.jsonl` transcript under `root` and tallies fires per element.

    `now` is passed in rather than read from the clock so a caller (classify's callers,
    and this unit's tests) can pin it; `count_usage` itself does not use `now` beyond
    accepting it for callers that want one now/root pairing.
    """
    transcripts = sorted(root.glob("**/*.jsonl"))
    elements: dict[str, ElementUsage] = {}
    fire_dates: list[date] = []

    for transcript in transcripts:
        try:
            fires = list(_iter_fires(transcript))
        except OSError:
            # One unreadable transcript (permissions, mid-write removal) must not stop the
            # count over the rest (list-source-files.py's own one-bad-file tolerance).
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


# Read top to bottom; take the first row that matches, mirroring verdict.py's own table
# shape. RARE_BY_DESIGN is checked before the fire count so a rare element never reaches
# DELETE_CANDIDATE through the zero-fires row below it. The window check sits under
# `fires > 0`, never under `fires == 0`: zero fires always pairs with last_used=None (only a
# fire sets last_used), so a "last_used is None" row above the zero-fires row would swallow
# every zero-fire element into UNMEASURED and make DELETE_CANDIDATE unreachable — caught by
# this unit's own break-the-implementation pass on T-002 (docs/wiki/brittle-test-removal.md).
#
# | Condition                                                   | Verdict              |
# | -------------------------------------------------------------- | --------------------- |
# | path is in RARE_BY_DESIGN                                      | NEEDS_HUMAN_JUDGMENT  |
# | fires > 0 and last_used is None (inconsistent input)           | UNMEASURED            |
# | fires > 0 and last_used falls outside MEASUREMENT_WINDOW_DAYS  | UNMEASURED            |
# | fires > 0 and last_used falls inside MEASUREMENT_WINDOW_DAYS   | NEEDS_HUMAN_JUDGMENT  |
# | fires == 0                                                      | DELETE_CANDIDATE      |
def classify(path: str, *, fires: int, last_used: str | None, now: date) -> str:
    """Assigns one element's usage observation to DELETE_CANDIDATE, NEEDS_HUMAN_JUDGMENT,
    or UNMEASURED, per the table above. Reads RARE_BY_DESIGN and MEASUREMENT_WINDOW_DAYS
    from the module namespace (not captured defaults) so patching either at runtime changes
    the verdict this returns, the same shape arms.measurement_status relies on for
    RUN_COUNT."""
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
    result = count_usage(Path(argv[1]), now=date.today())
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
