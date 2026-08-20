#!/usr/bin/env python3
"""Usage: triage.py '<JSON array of patterns>'

Each element is {name, evidence: [str], existing: "page"|"candidate"|"none"}.

stdout: JSON { pages, candidates, deferred }
exit: 0, or 2 when the argument is missing
"""

import json
import sys
from typing import Literal, TypedDict, cast

# A pattern with fewer than two pieces of evidence does not become a page. One piece cannot show
# recurrence, and pageifying it turns a one-off circumstance into a convention.
EVIDENCE_THRESHOLD = 2

# How many pages one PR moves. Candidate appends and reference repairs are not counted.
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

    # sorted is stable, so patterns tied on evidence count keep their input order and the same
    # input never splits differently between runs.
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
        print("usage: triage.py '<JSON array of patterns>'", file=sys.stderr)
        sys.exit(2)
    patterns = cast(list[Pattern], json.loads(sys.argv[1]))
    print(json.dumps(triage(patterns), ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
