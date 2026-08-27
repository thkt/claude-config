#!/usr/bin/env python3
"""ablate skill における、削除候補の DR 突き合わせゲート。

CLI のエントリポイントではない。skills/ablate/SKILL.md はこのモジュールを script として
呼ぶのでなく、下の定数と `gate` を import して使う (docs/wiki/deterministic-script-judgment.md
「入力から一意に決まる判定は script に置く」— DR の照合と保留/通過の判定は SKILL.md の散文
でなく、この script の関数として持つ)。

このユニット (issue #485 の U-001) は skills/census/SKILL.md Phase 3 の DR 突き合わせに倣う。
要素パスを支配する DR を引き、その削除候補が verdict.classify の判定をそのまま通してよいか
判定する。DR の照合はパス文字列の文字通りの検索で、`root` 下の docs/decisions/*.md を対象と
する — パスを自分自身へ写す機械可読フィールドを持つ DR はまだ無いため、DR 本文をパス文字列で
grep することが、census Phase 3 の候補-DR 突き合わせがここで還元される機械的な代替になる。
"""

from __future__ import annotations

import re
from pathlib import Path

from verdict import DELETE_CANDIDATE

# 削除候補が、確認記録の無い Reassessment Triggers を持つ DR に紐づくときに、入力の verdict
# の代わりに返す。verdict.py 自身の定数とは別物: これは dr_gate 独自の結果であり、
# verdict.classify が返す 3 つのいずれでもない。
HELD = "held"

# パス文字列が DR 本文にそのまま現れるとき、その DR がそのパスを支配すると見なす (このモジ
# ュールの docstring に書いた機械的な代替。パスを自分自身へ写す DR のフィールドはまだ無い)。
# docs/wiki/path-reference-audit.md: この glob は展開せず Path.glob にそのまま渡し、展開
# 済みのファイル一覧を手で書き写すことはしない。
_DR_GLOB = "docs/decisions/*.md"

# このゲートが確認記録を読みに行く節。docs/decisions/*.md には見出しの深さにより "## " と
# "### " の両方が現れるため、パターンはどちらにもマッチする。
_TRIGGERS_HEADING = re.compile(r"^#{2,3}\s+Reassessment Triggers\s*$", re.MULTILINE)

# このユニット独自の規約 (機械可読な DR フィールドについてはモジュール docstring を参照):
# DR ファイル内の "Confirmed unmet: {date}" という行は、誰かが既に Reassessment Triggers
# を確認し、まだ発火していないと判断したことを表す。
_CONFIRMED_UNMET = re.compile(r"^Confirmed unmet:", re.MULTILINE)


def _find_governing_dr(path: str, root: Path) -> Path | None:
    """`root` 下の _DR_GLOB にマッチするファイルのうち、本文に `path` が現れる最初の
    ファイル。どの DR も言及しないときは None (docs/decisions/ 自体が無いときも glob の
    結果が空になり、同じく None)。"""
    for dr_path in sorted(root.glob(_DR_GLOB)):
        if path in dr_path.read_text(encoding="utf-8"):
            return dr_path
    return None


def _confirmed_unmet(dr_text: str) -> bool:
    """DR の Reassessment Triggers 節に続けて、次の見出し (または文書末) より前に確認記録
    があるとき True。"""
    heading = _TRIGGERS_HEADING.search(dr_text)
    if heading is None:
        return False
    next_heading = re.search(r"^#{1,6}\s+\S", dr_text[heading.end() :], re.MULTILINE)
    section_end = heading.end() + (next_heading.start() if next_heading else len(dr_text) - heading.end())
    section = dr_text[heading.end() : section_end]
    return _CONFIRMED_UNMET.search(section) is not None


def gate(path: str, verdict: str, root: Path) -> str:
    """`verdict` が DELETE_CANDIDATE で、かつ `path` が確認記録の無い Reassessment
    Triggers を持つ DR に紐づくときだけ HELD を返し、それ以外は `verdict` をそのまま返す。
    DELETE_CANDIDATE 以外の verdict、または支配する DR の無いパスは常にそのまま通す —
    このゲートは削除候補を保留に落とすことしかしない。"""
    if verdict != DELETE_CANDIDATE:
        return verdict
    dr_path = _find_governing_dr(path, root)
    if dr_path is None:
        return verdict
    if _confirmed_unmet(dr_path.read_text(encoding="utf-8")):
        return verdict
    return HELD
