#!/usr/bin/env python3
"""常時ロードされる 8 ファイルの enforcer 対応表。

Usage: enforcer_map.py <repo-root>
Output: TARGET_FILES 全体の空行以外の各行につき {file, line_number, verdict, enforcer?} を
1 要素とする JSON 配列を標準出力へ。ファイル順、その中では行順。

skills/census/scripts/list-source-files.py の形に倣う (対象集合と判定を module の定数として
持ち、その集合を辿って要素ごとに 1 行出力する薄い main()) — ゼロから別のスクリプト構成を
組み立てない。

テスト実行時は CLI エントリポイントとして動かない: skills/ablate/tests/enforcer_map_test.py は
このモジュールを shell out せず import し、classify_line と 2 つの verdict 定数を使う
(docs/wiki/deterministic-script-judgment.md「入力から一意に決まる判定は script に置く」)。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# このリポジトリの harness が、すべてのセッションのコンテキストへ常時ロードする 8 ファイル:
# ルートの CLAUDE.md と、frontmatter を持たない rules/**/*.md ファイルすべて
# (skills/_lib/harness_elements.py の classify() が定める ALWAYS_LOADED の条件 — frontmatter
# を持たない rules/**/*.md または CLAUDE.md)。SKILL.md の散文へ手で書き写すのでなく、この
# module の定数として持つ (docs/wiki/harness-production-divergence.md「供給の一覧を実行側の
# 定数として持つ」)。
TARGET_FILES = (
    "CLAUDE.md",
    "rules/PRINCIPLES.md",
    "rules/core/PREFLIGHT.md",
    "rules/core/BOUNDARIES.md",
    "rules/core/OUTCOME.md",
    "rules/core/OPERATION.md",
    "rules/conventions/PROSE.md",
    "rules/conventions/MIRROR.md",
)

DELETE_CANDIDATE = "delete-candidate"
ABLATION_RESIDUE = "ablation-residue"

# 対応表: 常時ロードされる行の完全一致テキスト -> それをすでに担保している
# hook / textlint / lint / test。散文でなく script の定数として持つ
# (docs/wiki/deterministic-script-judgment.md「必須集合の充足は script に置く」) —
# この表に無い行は検証済みの enforcer を持たないため、classify_line は誰も確かめていない
# 担保を仮定せず ABLATION_RESIDUE を返す。
#
# ここに載る key はすべて元ファイルからそのまま (無加工の生テキストで) 複製したもの、value は
# このセッションが 2 通りで確認した path: settings.json に hook として登録されている、かつ
# その実行時出力自身が担保している rule を引用している
# (rules/core/OPERATION.md「Code claims | Read the lines before describing them」)。
# このセッションが enforcer を確認できなかった rule は、推測せず表から外す
# (rules/core/OPERATION.md「Knowledge gaps | Verify... before proceeding」)。
ENFORCER_TABLE = {
    # rules/conventions/MIRROR.md の "Prose language" 行: "Japanese under `.ja/`, English
    # everywhere else."。hooks/edit/mirror_prose_guard.py は settings.json に .ja/ 側・
    # 英語側の両方の path を対象とする PostToolUse Edit/Write hook として登録されており、
    # hooks/_lib/mirror_prose.py の check() / check_english() はそれぞれ、この違反 (.ja/
    # ファイルに日本語が 1 文字も無い、または英語側ファイルにまだ日本語が残っている) に対して
    # 出す警告の中で "(MIRROR.md)" を引用している。
    "| Prose language | Japanese under `.ja/`, English everywhere else. Covers comments, "
    "test names, and assertion messages                                                   |": (
        "hooks/edit/mirror_prose_guard.py"
    ),
}


def classify_line(line: str) -> str:
    """`line` が ENFORCER_TABLE の key に完全一致するとき DELETE_CANDIDATE — 既存の
    hook/textlint/lint/test がすでに担保しており、常時ロードされる複製は script が毎回
    検査している内容を繰り返しているだけになる。それ以外は ABLATION_RESIDUE:
    この行を検証済みで担保する enforcer は今のところ無いため、削れば他の何も肩代わりしない
    保証が失われる。"""
    return DELETE_CANDIDATE if line in ENFORCER_TABLE else ABLATION_RESIDUE


def classify_file(root: Path, rel_path: str) -> list[dict[str, object]]:
    """1 ファイルの空行以外の各行を、ファイル順に分類する。空行は対応付ける rule を
    持たないため、residue として報告せずスキップする。"""
    text = (root / rel_path).read_text(encoding="utf-8")
    results: list[dict[str, object]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        verdict = classify_line(line)
        entry: dict[str, object] = {
            "file": rel_path,
            "line_number": line_number,
            "verdict": verdict,
        }
        if verdict == DELETE_CANDIDATE:
            entry["enforcer"] = ENFORCER_TABLE[line]
        results.append(entry)
    return results


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: enforcer_map.py <repo-root>", file=sys.stderr)
        return 2
    root = Path(argv[1])
    results: list[dict[str, object]] = []
    for rel_path in TARGET_FILES:
        path = root / rel_path
        if not path.is_file():
            # 対象ファイルが 1 つ欠けていても (絞り込まれた checkout、rule ファイルの
            # rename) 残りの対応付けを止めない
            # (skills/census/scripts/list-source-files.py の count_lines が読めない
            # source ファイル 1 つに対して行うのと同じ扱い)。
            continue
        results.extend(classify_file(root, rel_path))
    print(json.dumps(results, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
