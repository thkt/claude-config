#!/usr/bin/env python3
"""Usage: triage.py '<共通項の JSON 配列>'

各要素は {name, evidence: [str], existing: "page"|"candidate"|"none"}。

stdout: JSON { pages, candidates, deferred }
exit: 0。引数が無いときは 2
"""

import json
import sys
from typing import Literal, TypedDict, cast

# 根拠が 2 件に満たない共通項はページにしない。1 件では繰り返しと言えず、
# 1 度きりの個別事情をページ化してしまう。
EVIDENCE_THRESHOLD = 2

# 1 回の PR で動かすページ数の上限。候補への追記と参照修理は数えない。
PAGE_CAP = 3

ACTION = {"page": "update", "candidate": "promote", "none": "create"}


class Pattern(TypedDict, total=False):
    name: str
    evidence: list[str]
    existing: Literal["page", "candidate", "none"]


class Row(TypedDict):
    name: str
    count: int
    evidence: list[str]
    existing: str


class Triaged(Row):
    action: str


def _row(pattern: Pattern) -> Row:
    evidence = pattern.get("evidence") or []
    return {
        "name": pattern.get("name", ""),
        "count": len(evidence),
        "evidence": evidence,
        "existing": pattern.get("existing") or "none",
    }


def triage(patterns: list[Pattern]) -> dict[str, list[Triaged]]:
    rows = [_row(p) for p in patterns]

    candidates: list[Triaged] = [
        {**r, "action": "candidate"} for r in rows if r["count"] < EVIDENCE_THRESHOLD
    ]

    # sorted は安定なので、根拠の数が同じ共通項は入力順のまま残り、同じ入力が実行ごとに
    # 違う分かれ方をしない。
    promoted: list[Triaged] = [
        {**r, "action": ACTION[r["existing"]]}
        for r in sorted(
            (r for r in rows if r["count"] >= EVIDENCE_THRESHOLD), key=lambda r: -r["count"]
        )
    ]

    return {
        "pages": promoted[:PAGE_CAP],
        "candidates": candidates,
        "deferred": promoted[PAGE_CAP:],
    }


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: triage.py '<共通項の JSON 配列>'", file=sys.stderr)
        sys.exit(2)
    patterns = cast(list[Pattern], json.loads(sys.argv[1]))
    print(json.dumps(triage(patterns), ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
