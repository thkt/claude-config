#!/usr/bin/env python3
"""Usage: review_score.py <expected.json> <results.json> [previous-results.json]

stdout: JSON { counts, metrics, byCategory, diff, unknownVerdicts }
exit: 0 when every verdict is in the closed set, 1 otherwise, 2 when an argument is missing
"""

import json
import sys
from pathlib import Path
from typing import Any, cast

# The verdict set is closed. Earlier logs each invented their own wording (true, hit, full_hit,
# detected_below_severity_min), which left the metrics incomparable between runs and made the
# diff the harness doc promises impossible to take.
VERDICTS = {
    "hit": "the expected finding, reported at severity_min or above",
    "below_severity": "the expected finding, reported below severity_min",
    "other_finding": "a finding on the file, but not the expected one",
    "miss": "no finding on the file",
    "pass": "a clean case that drew no finding",
    "false_positive": "a clean case that drew a finding",
}


def _ratio(hit: int, total: int) -> float | None:
    return None if total == 0 else round(hit / total, 3)


def score(
    expected: list[dict[str, Any]],
    results: list[dict[str, Any]],
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    verdict_by_file = {r.get("file"): r.get("verdict") for r in results}
    unknown = [v for v in dict.fromkeys(r.get("verdict") for r in results) if v not in VERDICTS]

    flagged = [e for e in expected if e.get("expected") == "detected"]
    clean = [e for e in expected if e.get("expected") == "no_finding"]

    # A case with no verdict counts as a miss rather than dropping out. Dropping it would raise
    # recall by shrinking the denominator, which is the direction that hides a regression.
    def verdict_of(entry: dict[str, Any]) -> str:
        fallback = "miss" if entry.get("expected") == "detected" else "pass"
        return verdict_by_file.get(entry.get("file")) or fallback

    counts = {
        "flagged": len(flagged),
        "clean": len(clean),
        "hit": sum(1 for e in flagged if verdict_of(e) == "hit"),
        "below_severity": sum(1 for e in flagged if verdict_of(e) == "below_severity"),
        "other_finding": sum(1 for e in flagged if verdict_of(e) == "other_finding"),
        "miss": sum(1 for e in flagged if verdict_of(e) == "miss"),
        "false_positive": sum(1 for e in clean if verdict_of(e) == "false_positive"),
    }

    metrics = {
        "recall_detection": _ratio(
            counts["hit"] + counts["below_severity"] + counts["other_finding"], counts["flagged"]
        ),
        "recall_expected": _ratio(counts["hit"] + counts["below_severity"], counts["flagged"]),
        "recall_strict": _ratio(counts["hit"], counts["flagged"]),
        "fp_rate": _ratio(counts["false_positive"], counts["clean"]),
    }

    by_category: dict[str, dict[str, Any]] = {}
    for entry in flagged:
        key = entry.get("category") or "uncategorized"
        bucket = by_category.setdefault(key, {"total": 0, "hit": 0})
        bucket["total"] += 1
        if verdict_of(entry) == "hit":
            bucket["hit"] += 1
    for bucket in by_category.values():
        bucket["recall_strict"] = _ratio(bucket["hit"], bucket["total"])

    diff = None
    if previous is not None:
        before = previous.get("metrics") or {}
        diff = {
            key: None
            if value is None or before.get(key) is None
            else round(value - before[key], 3)
            for key, value in metrics.items()
        }

    return {
        "counts": counts,
        "metrics": metrics,
        "byCategory": by_category,
        "diff": diff,
        "unknownVerdicts": unknown,
    }


def _load(path: str) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: review_score.py <expected.json> <results.json> [previous]", file=sys.stderr)
        sys.exit(2)
    # json.loads hands back Any. The cast is where the shape stops being unchecked, so the
    # arguments below are the boundary the schema in this file's docstring describes.
    results = _load(sys.argv[2])
    rows = results.get("results", results) if isinstance(results, dict) else results
    report = score(
        cast(list[dict[str, Any]], _load(sys.argv[1])),
        cast(list[dict[str, Any]], rows),
        cast(dict[str, Any] | None, _load(sys.argv[3]) if len(sys.argv) > 3 else None),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(1 if report["unknownVerdicts"] else 0)


if __name__ == "__main__":
    main()
