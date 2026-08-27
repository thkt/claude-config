#!/usr/bin/env python3
"""Report assembly for the ablate skill.

Not a CLI entry point: skills/ablate/SKILL.md imports this module for `build_report` and
`write_report` below rather than shelling out to it (docs/wiki/deterministic-script-judgment.md
"入力から一意に決まる判定は script に置く" — enumeration, arm listing, verdict
classification, and the DR gate each already live in their own script; this module's own job
is only to call those four in sequence and hand the combined result to the caller, mirroring
verdict.py's `from arms import UNMEASURED` sibling-import shape rather than re-deriving any of
their constants here).

Caller contract: the caller (currently skills/ablate/tests/report_test.py; eventually
skills/ablate/SKILL.md) puts this module's directory and skills/_lib on sys.path before
importing it, the same way harness_elements.py and verdict.py are already imported by their
own tests — report.py does not manipulate sys.path itself.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

import arms
import dr_gate
import harness_elements
import verdict

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


def build_report(root: Path, observations: list[dict[str, Any]]) -> dict[str, Any]:
    """Runs the three preceding units in sequence and wires their outputs together.

    1. harness_elements.enumerate_elements(root) — the full harness population and each
       member's classification.
    2. arms.ARMS — every arm this ablation run compares.
    3. verdict.classify(...), once per observation — the delete-candidate /
       needs-human-judgment / unmeasured label for the element that observation reports on.
    4. dr_gate.gate(...), once per observation — holds back a DELETE_CANDIDATE verdict
       whose path traces to a DR with no Reassessment Triggers confirmation record (U-001).
       Runs after verdict.classify's one-sided judgment and before the result is handed to
       write_report, so a held candidate never reaches delete_candidates below.

    Returns a plain dict (elements / arms / verdicts / delete_candidates) rather than a
    report string, so a caller that only wants the data (this unit's tests) does not have to
    parse Markdown back out of write_report's output.
    """
    elements = harness_elements.enumerate_elements(root)

    verdicts: dict[str, str] = {}
    for observation in observations:
        path = observation["path"]
        raw_verdict = verdict.classify(
            trigger_task=observation.get("trigger_task"),
            task_set=observation.get("task_set"),
            complies=observation.get("complies"),
        )
        verdicts[path] = dr_gate.gate(path=path, verdict=raw_verdict, root=root)

    delete_candidates = [
        path
        for path in verdicts
        if verdicts[path] == verdict.DELETE_CANDIDATE and not _is_apparatus(path)
    ]

    return {
        "elements": elements,
        "arms": list(arms.ARMS),
        "verdicts": verdicts,
        "delete_candidates": sorted(delete_candidates),
    }


def _table(headers: tuple[str, str], rows: list[tuple[str, str]]) -> list[str]:
    """The header + separator + data lines of a two-column Markdown table, factored out
    because _render builds three of these (Summary, Harness Elements, Verdicts) from
    differently-shaped inputs — one column pairing changed here changes all three."""
    lines = [f"| {headers[0]} | {headers[1]} |", "| --- | --- |"]
    lines += [f"| {a} | {b} |" for a, b in rows]
    return lines


def _render(result: dict[str, Any]) -> str:
    """Renders `build_report`'s result as Markdown. Reads only the four keys build_report
    returns — never the raw `observations` a caller passed in — so a field an observation
    carries for its own provenance (such as the settings snapshot a run used) can never
    reach the written report, verbatim or otherwise (T-014)."""
    lines: list[str] = ["# Ablation Report", ""]

    lines += ["## Summary", ""]
    lines += _table(
        ("Metric", "Value"),
        [
            ("Harness elements enumerated", str(len(result["elements"]))),
            ("Arms", str(len(result["arms"]))),
            ("Elements observed", str(len(result["verdicts"]))),
            ("Delete candidates", str(len(result["delete_candidates"]))),
            # Counted apart, the way census's report gives the DR-excluded candidates their own
            # Summary row: without it the number is only reachable by scanning the Verdicts table
            # for the held literal.
            (
                "Held by a live DR",
                str(sum(1 for v in result["verdicts"].values() if v == dr_gate.HELD)),
            ),
        ],
    )
    lines += [""]

    lines += ["## Harness Elements", ""]
    lines += _table(
        ("Path", "Classification"),
        [(element["path"], element["classification"]) for element in result["elements"]],
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
