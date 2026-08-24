#!/usr/bin/env python3
"""Usage: review_score.py <expected.json> <results.json> [previous-results.json]

stdout: JSON { counts, metrics, byCategory, diff, unknownVerdicts }
exit: verdict が全て閉じた集合の中なら 0、外があれば 1、引数が足りなければ 2
"""

import json
import sys
from pathlib import Path
from typing import TypedDict, cast

# verdict は閉じた集合にする。過去のログは実行ごとに独自の語 (true、hit、full_hit、
# detected_below_severity_min) を使っており、実行どうしで指標を比べられず、
# ハーネス文書が謳う差分が取れなくなっていた。
VERDICTS = {
    "hit": "期待した finding を severity_min 以上で報告した",
    "below_severity": "期待した finding を報告したが severity_min に届かない",
    "other_finding": "ファイルに finding は出たが期待したものではない",
    "miss": "ファイルに finding が出なかった",
    "pass": "clean ケースで finding が出なかった",
    "false_positive": "clean ケースで finding が出た",
}


class _CaseKeys(TypedDict):
    file: str
    expected: str


class Case(_CaseKeys, total=False):
    """expected.json の 1 件。clean ケースは category と severity_min を持たない。"""

    category: str
    severity_min: str


class Outcome(TypedDict, total=False):
    """results.json の 1 件。verdict を欠く行は形が壊れているので unknown へ落ちる。"""

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


# TypedDict でなく dict なのは、diff がキーを舐めて前回と引き算するため。TypedDict の
# items() は値を object へ潰すので、引き算する側で型が付かなくなる。
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

    # verdict の無いケースは脱落でなく miss として数える。落とすと分母が縮んで recall が上がり、
    # 退行を隠す方向へ倒れる。
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
            # `baseline is None` で済ませないのは、過去のログが指標を散文で書いており、
            # 引き算がそこで採点ごと落としていたため。
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
    # 以下の cast が、形の検査されない値を抜ける境界になる。
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
