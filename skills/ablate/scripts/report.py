#!/usr/bin/env python3
"""Report assembly for the ablate skill.

Not a CLI entry point: skills/ablate/SKILL.md imports `build_report` and `write_report`
rather than shelling out. Each judgment this module combines already lives in its own script
(docs/wiki/deterministic-script-judgment.md "入力から一意に決まる判定は script に置く"), so
none of their constants is re-derived here.

The caller puts this module's directory and skills/_lib on sys.path before importing it;
report.py does not manipulate sys.path itself.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

import arms
import dr_gate
import harness_elements
import usage_counts
import verdict

# Held here once so every caller reads the same value rather than each re-deriving it.
TRANSCRIPTS_ROOT = Path.home() / ".claude" / "projects"

# The ablation apparatus's own script tree. A path under here is the code that produced the
# observation, not a harness element under test, so it must never appear in
# delete_candidates: deleting the apparatus that measures harness elements would remove the
# ability to keep measuring them (this unit's T-015 contract, "the ablation apparatus itself
# is absent from the delete candidates").
APPARATUS_DIR = "skills/ablate/"

REPORT_NAME = "ablate"


def _is_apparatus(path: str) -> bool:
    """True when `path` sits inside APPARATUS_DIR (the ablate skill's own tree, matching
    harness_elements.POPULATION_GLOBS's "skills/**/scripts/*.py" the way
    skills/ablate/scripts/report.py itself does)."""
    return PurePosixPath(path).as_posix().startswith(APPARATUS_DIR)


def _usage_verdict(path: str, usage_elements: dict[str, Any], today: date) -> str:
    """The usage verdict for one path. An element with no transcript entry never fired, so it
    reaches classify as zero fires rather than being skipped."""
    entry = usage_elements.get(path, {})
    return usage_counts.classify(
        path, fires=entry.get("fires", 0), last_used=entry.get("last_used"), now=today
    )


def build_report(
    root: Path, observations: list[dict[str, Any]], *, now: date | None = None
) -> dict[str, Any]:
    """Calls each preceding unit's script in turn and wires their outputs together.

    dr_gate.gate runs after verdict.classify's one-sided judgment and before the result
    reaches write_report, so a held candidate never enters delete_candidates below.

    usage_counts reads session transcripts rather than `observations`, so the reader learns
    usage from the report without also running an ablation arm.

    Returns a plain dict rather than a report string, so a caller that only wants the data
    does not have to parse Markdown back out of write_report's output.
    """
    today = now or datetime.now(timezone.utc).date()
    elements = harness_elements.enumerate_elements(root)
    usage = usage_counts.count_usage(TRANSCRIPTS_ROOT)

    verdicts: dict[str, str] = {}
    for observation in observations:
        path = observation["path"]
        raw_verdict = verdict.classify(
            trigger_task=observation.get("trigger_task"),
            task_set=observation.get("task_set"),
            complies=observation.get("complies"),
        )
        verdicts[path] = dr_gate.gate(path=path, verdict=raw_verdict, root=root)

    usage_verdicts = {
        path: _usage_verdict(path, usage["elements"], today)
        for path in {element["path"] for element in elements} | set(verdicts)
    }

    delete_candidates = [
        path
        for path in verdicts
        if verdicts[path] == verdict.DELETE_CANDIDATE
        and usage_verdicts[path] == verdict.DELETE_CANDIDATE
        and not _is_apparatus(path)
    ]

    return {
        "elements": elements,
        "arms": list(arms.ARMS),
        "verdicts": verdicts,
        "usage_verdicts": usage_verdicts,
        "delete_candidates": sorted(delete_candidates),
        "usage": usage["elements"],
        "transcripts": {
            "count": usage["transcript_count"],
            "date_range": usage["date_range"],
        },
    }


def _table(headers: tuple[str, ...], rows: list[tuple[str, ...]]) -> list[str]:
    """The header + separator + data lines of an N-column Markdown table, factored out
    because _render builds three of these (Summary, Harness Elements, Verdicts) from
    differently-shaped inputs — one column pairing changed here changes all three. Column
    count is read from `headers` alone, so Harness Elements' four columns (Path,
    Classification, Fires, Last Used) and the other two-column tables share this one
    renderer."""
    lines = [f"| {' | '.join(headers)} |", f"| {' | '.join('---' for _ in headers)} |"]
    lines += [f"| {' | '.join(row)} |" for row in rows]
    return lines


def _date_range(date_range: dict[str, str | None]) -> str:
    """The parsed transcripts' date span as one cell. A run whose transcripts hold no fire has
    no span, and renders as "none" rather than as a pair of empty cells."""
    start, end = date_range.get("start"), date_range.get("end")
    return f"{start} - {end}" if start and end else "none"


def _render(result: dict[str, Any]) -> str:
    """Renders `build_report`'s result as Markdown. Reads that result alone, never the raw
    `observations` a caller passed in, so a field an observation carries for its own
    provenance (such as the settings snapshot a run used) can never reach the written
    report, verbatim or otherwise (T-014)."""
    lines: list[str] = ["# Ablation Report", ""]

    lines += ["## Summary", ""]
    lines += _table(
        ("Metric", "Value"),
        [
            ("Harness elements enumerated", str(len(result["elements"]))),
            ("Arms", str(len(result["arms"]))),
            ("Elements observed", str(len(result["verdicts"]))),
            ("Delete candidates", str(len(result["delete_candidates"]))),
            # Counted apart, since without this row the number is only reachable by
            # scanning the Verdicts table for the held literal.
            (
                "Held by a live DR",
                str(sum(1 for v in result["verdicts"].values() if v == dr_gate.HELD)),
            ),
            ("Transcripts parsed", str(result["transcripts"]["count"])),
            ("Transcript date range", _date_range(result["transcripts"]["date_range"])),
        ],
    )
    lines += [""]

    lines += ["## Harness Elements", ""]
    usage = result.get("usage", {})
    lines += _table(
        ("Path", "Classification", "Fires", "Last Used", "Usage Verdict"),
        [
            (
                element["path"],
                element["classification"],
                str(element_usage.get("fires", 0)),
                element_usage.get("last_used") or "never",
                result["usage_verdicts"][element["path"]],
            )
            for element in result["elements"]
            for element_usage in [usage.get(element["path"], {})]
        ],
    )
    lines += [""]

    lines += ["## Arms", ""]
    lines += [f"- {arm}" for arm in result["arms"]]
    lines += [""]

    lines += ["## Verdicts", ""]
    lines += _table(
        ("Path", "Verdict"),
        [(path, result["verdicts"][path]) for path in sorted(result["verdicts"])],
    )
    lines += [""]

    lines += ["## Delete Candidates", ""]
    if result["delete_candidates"]:
        lines += [f"- {path}" for path in result["delete_candidates"]]
    else:
        lines += ["No delete candidates."]
    lines += [""]

    return "\n".join(lines)


def write_report(
    root: Path, observations: list[dict[str, Any]], out_dir: Path | None = None
) -> Path:
    """Writes the report to `<out_dir>/<YYYY-MM-DD>-<HHMMSS>-ablate.md` in UTC (this
    module's convention, matching skills/census/SKILL.md Phase 5's `date -u
    +%Y-%m-%d-%H%M%S` naming so same-day reruns from different timezones never collide).
    `out_dir` defaults to `<root>/docs/audit/`; tests pass a temporary directory instead of
    writing into the real tree."""
    result = build_report(root, observations)
    content = _render(result)

    target_dir = out_dir if out_dir is not None else root / "docs" / "audit"
    target_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M%S")
    report_path = target_dir / f"{timestamp}-{REPORT_NAME}.md"
    report_path.write_text(content, encoding="utf-8")
    return report_path
