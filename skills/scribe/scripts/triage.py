#!/usr/bin/env python3
"""Usage: triage.py '<JSON array of patterns>' <candidates-file>

Each element is {name, evidence: [str], existing: "page"|"candidate"|"none"}. The array carries
what this run extracted; the candidate store is read here rather than passed in, so a run cannot
leave the carried-over rows out of the ranking.

stdout: JSON { pages, candidates, deferred, commits }
exit: 0, or 2 when an argument is missing
"""

import json
import re
import sys
from pathlib import Path
from typing import Literal, TypedDict, cast

# A pattern with fewer than two pieces of evidence does not become a page. One piece cannot show
# recurrence, and pageifying it turns a one-off circumstance into a convention.
EVIDENCE_THRESHOLD = 2

# How many pages one commit moves. Candidate appends and reference repairs are not counted.
PAGE_CAP = 3

# How many commits one run moves. Provisional: revisit once the first multi-commit PR's merge
# time is measured.
COMMIT_CAP = 3

ACTION = {"page": "update", "candidate": "promote", "none": "create"}

STORE_SECTIONS = ("## 昇格待ち", "## 単発")

EVIDENCE = re.compile(r"#\d+|\(research\)")


class Pattern(TypedDict, total=False):
    name: str
    evidence: list[str]
    existing: Literal["page", "candidate", "none"]
    # Which STORE_SECTIONS heading the accumulated row lived under. Absent on a fresh row.
    section: str


class _RequiredRow(TypedDict):
    name: str
    count: int
    evidence: list[str]
    existing: str


class Row(_RequiredRow, total=False):
    # Which section the accumulated row came from. Absent on a row that originates in fresh.
    section: str


class Triaged(Row):
    action: str


class Report(TypedDict):
    pages: list[Triaged]
    candidates: list[Triaged]
    deferred: list[Triaged]
    commits: list[list[Triaged]]


def _row(pattern: Pattern) -> Row:
    evidence = pattern.get("evidence") or []
    row: Row = {
        "name": pattern.get("name", ""),
        "count": len(evidence),
        "evidence": evidence,
        "existing": pattern.get("existing") or "none",
    }
    section = pattern.get("section")
    if section is not None:
        row["section"] = section
    return row


def triage(patterns: list[Pattern]) -> Report:
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

    # deferred now carries what the commit cap left behind, not what the page cap did.
    commits = [promoted[i : i + PAGE_CAP] for i in range(0, len(promoted), PAGE_CAP)][:COMMIT_CAP]
    pages = [page for commit in commits for page in commit]

    return {
        "pages": pages,
        "candidates": candidates,
        "deferred": promoted[len(pages) :],
        "commits": commits,
    }


def read_store(path: Path) -> list[Pattern]:
    """Phase 1 creates the store inside Phase 6's worktree, so the first run has none."""
    if not path.is_file():
        return []
    rows: list[Pattern] = []
    dropped: list[str] = []
    section: str | None = None
    for line in path.read_text(encoding="utf-8").split("\n"):
        if line.startswith("## "):
            section = next(
                (s.removeprefix("## ") for s in STORE_SECTIONS if line.startswith(s)), None
            )
            continue
        if section is None or not line.startswith("- "):
            continue
        body = line[2:]
        evidence = EVIDENCE.findall(body)
        name = EVIDENCE.sub("", body).strip()
        if name:
            rows.append(
                {"name": name, "evidence": evidence, "existing": "candidate", "section": section}
            )
        else:
            dropped.append(line)
    # Not stdout: the report there is a closed 4-key object the skill parses.
    if dropped:
        print(
            f"triage.py: skipped {len(dropped)} candidate row(s) carrying no body", file=sys.stderr
        )
        for line in dropped:
            print(f"  {line}", file=sys.stderr)
    return rows


def merge(store: list[Pattern], fresh: list[Pattern]) -> list[Pattern]:
    """Fresh first would let a pattern tying on evidence count displace one that already waited
    a run, since sorted is stable. The accumulated row's front position is decided here, and
    overwriting its existing from fresh below does not disturb that."""
    merged: list[Pattern] = []
    index: dict[str, int] = {}
    for p in [*store, *fresh]:
        name = p.get("name", "")
        at = index.get(name)
        if at is None:
            index[name] = len(merged)
            merged.append({**p, "evidence": list(p.get("evidence") or [])})
            continue
        seen = merged[at]["evidence"]
        seen.extend(e for e in (p.get("evidence") or []) if e not in seen)
        # The accumulated row's existing is only the fixed value read_store attached. Which side
        # fresh saw the same name on this time is what the row actually is now, so it wins.
        existing = p.get("existing")
        if existing is not None:
            merged[at]["existing"] = existing
    return merged


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: triage.py '<JSON array of patterns>' <candidates-file>", file=sys.stderr)
        sys.exit(2)
    fresh = cast(list[Pattern], json.loads(sys.argv[1]))
    rows = merge(read_store(Path(sys.argv[2])), fresh)
    print(json.dumps(triage(rows), ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
