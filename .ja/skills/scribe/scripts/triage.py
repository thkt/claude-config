#!/usr/bin/env python3
"""Usage: triage.py '<共通項の JSON 配列>' <candidates-file>

各要素は {name, evidence: [str], existing: "page"|"candidate"|"none"}。配列が運ぶのはこの run
が抽出した分で、候補の蓄積は引数で渡さずここで読む。run が持ち越しの行を順位付けから
落とせない形にするため。

stdout: JSON { pages, candidates, deferred, commits }
exit: 0。引数が無いときは 2
"""

import json
import re
import sys
from pathlib import Path
from typing import Literal, TypedDict, cast

# 根拠が 2 件に満たない共通項はページにしない。1 件では繰り返しと言えず、
# 1 度きりの個別事情をページ化してしまう。
EVIDENCE_THRESHOLD = 2

# 1 コミットで動かすページ数の上限。候補への追記と参照修理は数えない。
PAGE_CAP = 3

# 1 run で動かすコミット数の上限。暫定値。最初の複数コミット PR のマージ時間を測ってから
# 見直す。
COMMIT_CAP = 3

ACTION = {"page": "update", "candidate": "promote", "none": "create"}

STORE_SECTIONS = ("## 昇格待ち", "## 単発")

EVIDENCE = re.compile(r"#\d+|\(research\)")


class Pattern(TypedDict, total=False):
    name: str
    evidence: list[str]
    existing: Literal["page", "candidate", "none"]
    # 蓄積の行が STORE_SECTIONS のどの見出し配下にあったか。fresh には無い。
    section: str


class _RequiredRow(TypedDict):
    name: str
    count: int
    evidence: list[str]
    existing: str


class Row(_RequiredRow, total=False):
    # 蓄積行がどの節から来たかを運ぶ。fresh 由来の行には無い。
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

    # sorted は安定なので、根拠の数が同じ共通項は入力順のまま残り、同じ入力が実行ごとに
    # 違う分かれ方をしない。
    promoted: list[Triaged] = [
        {**r, "action": ACTION[r["existing"]]}
        for r in sorted(
            (r for r in rows if r["count"] >= EVIDENCE_THRESHOLD), key=lambda r: -r["count"]
        )
    ]

    # deferred が持つのは commit 上限が残した分で、page 上限が残した分ではない。
    commits = [promoted[i : i + PAGE_CAP] for i in range(0, len(promoted), PAGE_CAP)][:COMMIT_CAP]
    pages = [page for commit in commits for page in commit]

    return {
        "pages": pages,
        "candidates": candidates,
        "deferred": promoted[len(pages) :],
        "commits": commits,
    }


def read_store(path: Path) -> list[Pattern]:
    """Phase 1 が蓄積を Phase 6 の worktree 内で作るので、初回 run には無い。"""
    if not path.is_file():
        return []
    rows: list[Pattern] = []
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
    return rows


def merge(store: list[Pattern], fresh: list[Pattern]) -> list[Pattern]:
    """fresh を先にすると、sorted が安定なぶん、根拠数で並んだ共通項が 1 run 待った側を
    押しのける。蓄積行を先頭に置く位置はここで決まり、以降 fresh 側の existing で上書きしても
    崩れない。"""
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
        # 蓄積行の existing は read_store が付けた固定値でしかない。同じ名前を fresh が
        # 今回どちらで見たかの方が実体を表すので、それで上書きする。
        existing = p.get("existing")
        if existing is not None:
            merged[at]["existing"] = existing
    return merged


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: triage.py '<共通項の JSON 配列>' <candidates-file>", file=sys.stderr)
        sys.exit(2)
    fresh = cast(list[Pattern], json.loads(sys.argv[1]))
    rows = merge(read_store(Path(sys.argv[2])), fresh)
    print(json.dumps(triage(rows), ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
