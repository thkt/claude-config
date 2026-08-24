#!/usr/bin/env python3
"""Usage: review_score.py <expected.json> <results.json> [previous-results.json]

stdout: JSON { counts, metrics, byCategory, diff, unknownVerdicts }
exit: 0 when every verdict is in the closed set, 1 otherwise, 2 when an argument is missing
"""

import json
import sys
from pathlib import Path
from typing import TypedDict, cast

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


class _CaseKeys(TypedDict):
    file: str
    expected: str


class Case(_CaseKeys, total=False):
    """One entry of expected.json. A clean case carries neither category nor severity_min."""

    category: str
    severity_min: str


class Outcome(TypedDict, total=False):
    """One entry of results.json. A row missing verdict is malformed and falls to unknown."""

    file: str
    verdict: str


class Counts(TypedDict):
    flagged: int
    clean: int
    hit: int
    below_severity: int
    other_finding: int
    miss: int
    false_positive: int


class Category(TypedDict):
    total: int
    hit: int
    recall_strict: float | None


# A dict rather than a TypedDict, because diff walks the keys and subtracts the previous run.
# TypedDict.items() flattens the value to object, which leaves the subtraction untyped.
Metrics = dict[str, float | None]


class Previous(TypedDict, total=False):
    metrics: Metrics


class Report(TypedDict):
    counts: Counts
    metrics: Metrics
    byCategory: dict[str, Category]
    diff: Metrics | None
    unknownVerdicts: list[str | None]


def _ratio(hit: int, total: int) -> float | None:
    return None if total == 0 else round(hit / total, 3)


def score(
    expected: list[Case],
    results: list[Outcome],
    previous: Previous | None = None,
) -> Report:
    verdict_by_file = {r.get("file"): r.get("verdict") for r in results}
    unknown = [v for v in dict.fromkeys(r.get("verdict") for r in results) if v not in VERDICTS]

    flagged = [e for e in expected if e.get("expected") == "detected"]
    clean = [e for e in expected if e.get("expected") == "no_finding"]

    # A case with no verdict counts as a miss rather than dropping out. Dropping it would raise
    # recall by shrinking the denominator, which is the direction that hides a regression.
    def verdict_of(entry: Case) -> str:
        fallback = "miss" if entry.get("expected") == "detected" else "pass"
        return verdict_by_file.get(entry.get("file")) or fallback

    counts: Counts = {
        "flagged": len(flagged),
        "clean": len(clean),
        "hit": sum(1 for e in flagged if verdict_of(e) == "hit"),
        "below_severity": sum(1 for e in flagged if verdict_of(e) == "below_severity"),
        "other_finding": sum(1 for e in flagged if verdict_of(e) == "other_finding"),
        "miss": sum(1 for e in flagged if verdict_of(e) == "miss"),
        "false_positive": sum(1 for e in clean if verdict_of(e) == "false_positive"),
    }

    metrics: Metrics = {
        "recall_detection": _ratio(
            counts["hit"] + counts["below_severity"] + counts["other_finding"], counts["flagged"]
        ),
        "recall_expected": _ratio(counts["hit"] + counts["below_severity"], counts["flagged"]),
        "recall_strict": _ratio(counts["hit"], counts["flagged"]),
        "fp_rate": _ratio(counts["false_positive"], counts["clean"]),
    }

    by_category: dict[str, Category] = {}
    for entry in flagged:
        key = entry.get("category") or "uncategorized"
        bucket = by_category.setdefault(key, {"total": 0, "hit": 0, "recall_strict": None})
        bucket["total"] += 1
        if verdict_of(entry) == "hit":
            bucket["hit"] += 1
    for bucket in by_category.values():
        bucket["recall_strict"] = _ratio(bucket["hit"], bucket["total"])

    diff: Metrics | None = None
    if previous is not None:
        before = previous.get("metrics") or {}
        diff = {}
        for key, value in metrics.items():
            baseline = before.get(key)
            # Earlier logs wrote a metric as prose ("75% (9/12) - ..."). Subtracting one takes the
            # whole scoring down, which loses this run's numbers over a missing comparison.
            if (
                value is None
                or not isinstance(baseline, (int, float))
                or isinstance(baseline, bool)
            ):
                diff[key] = None
            else:
                diff[key] = round(value - baseline, 3)

    return {
        "counts": counts,
        "metrics": metrics,
        "byCategory": by_category,
        "diff": diff,
        "unknownVerdicts": unknown,
    }


def _load(path: str) -> object:
    return cast(object, json.loads(Path(path).read_text(encoding="utf-8")))


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: review_score.py <expected.json> <results.json> [previous]", file=sys.stderr)
        sys.exit(2)
    # The casts below are the boundary where a value whose shape nothing checked stops being one.
    loaded = _load(sys.argv[2])
    rows: object = loaded
    if isinstance(loaded, dict):
        payload = cast(dict[str, object], loaded)
        rows = payload.get("results", payload)
    report = score(
        cast(list[Case], _load(sys.argv[1])),
        cast(list[Outcome], rows),
        cast(Previous | None, _load(sys.argv[3]) if len(sys.argv) > 3 else None),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(1 if report["unknownVerdicts"] else 0)


if __name__ == "__main__":
    main()
