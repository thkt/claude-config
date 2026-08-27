#!/usr/bin/env python3
"""ablate skill における、削除候補の DR 突き合わせゲート。

DR の照合と保留/通過の判定は、SKILL.md の散文でなくこの script の関数として持つ
(docs/wiki/deterministic-script-judgment.md)。

照合が DR 本文をパス文字列で検索するのは、パスを自分自身へ写す機械可読フィールドを持つ DR
がまだ無いため。
"""

from __future__ import annotations

import re
from pathlib import Path

from verdict import DELETE_CANDIDATE

# 削除候補が、確認記録の無い Reassessment Triggers を持つ DR に紐づくときに、入力の verdict
# の代わりに返す。verdict.py へ置かないのは、これが dr_gate 独自の結果であり、
# verdict.classify が返せる 4 つ目ではないため。
HELD = "held"

# 展開せず Path.glob にそのまま渡し、展開済みのファイル一覧を手で書き写すことはしない
# (docs/wiki/path-reference-audit.md)。
_DR_GLOB = "docs/decisions/*.md"

# このゲートが確認記録を読みに行く節。docs/decisions/*.md には見出しの深さにより "## " と
# "### " の両方が現れるため、パターンはどちらにもマッチする。
_TRIGGERS_HEADING = re.compile(r"^#{2,3}\s+Reassessment Triggers\s*$", re.MULTILINE)

# DR ファイル内の "Confirmed unmet: {date}" という行は、誰かが既に Reassessment Triggers
# を確認し、まだ発火していないと判断したことを表す。
_CONFIRMED_UNMET = re.compile(r"^Confirmed unmet:", re.MULTILINE)


def _find_governing_dr(path: str, root: Path) -> tuple[Path, str] | None:
    """`root` 下の _DR_GLOB にマッチするファイルのうち、本文に `path` が現れる最初の
    ファイルを、その本文テキストと組にして返す。どの DR も言及しないときは None。
    テキストをパスと一緒に返すのは、呼び出し側が本文を読むときに同じファイルを二度
    開かずに済ませるため。"""
    for dr_path in sorted(root.glob(_DR_GLOB)):
        text = dr_path.read_text(encoding="utf-8")
        if path in text:
            return dr_path, text
    return None


def _confirmed_unmet(dr_text: str) -> bool:
    """DR の Reassessment Triggers 節に続けて、次の見出し (または文書末) より前に確認記録
    があるとき True。"""
    heading = _TRIGGERS_HEADING.search(dr_text)
    if heading is None:
        return False
    next_heading = re.search(r"^#{1,6}\s+\S", dr_text[heading.end() :], re.MULTILINE)
    section_end = heading.end() + next_heading.start() if next_heading else len(dr_text)
    section = dr_text[heading.end() : section_end]
    return _CONFIRMED_UNMET.search(section) is not None


def gate(path: str, verdict: str, root: Path) -> str:
    """上から読んで最初に当たった行を採る。このゲートは削除候補を保留に落とすことしか
    せず、それ以外の verdict はそのまま通す。

    | 条件                                             | 結果    |
    | ------------------------------------------------ | ------- |
    | verdict が DELETE_CANDIDATE でない               | verdict |
    | path を支配する DR が無い                        | verdict |
    | 支配する DR が trigger を未達と記録している      | verdict |
    | それ以外 (生きている DR が path を支配する)      | HELD    |
    """
    if verdict != DELETE_CANDIDATE:
        return verdict
    found = _find_governing_dr(path, root)
    if found is None:
        return verdict
    _, dr_text = found
    if _confirmed_unmet(dr_text):
        return verdict
    return HELD
