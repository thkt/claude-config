#!/usr/bin/env python3
"""常時ロードされる harness ファイルの enforcer 対応表。

Usage: enforcer_map.py <repo-root>。skills/_lib を PYTHONPATH に置いて実行する。
Output: 常時ロードされる各ファイルの空行以外の各行につき
{file, line_number, verdict, enforcer?} を 1 要素とする JSON 配列を標準出力へ。
ファイル順、その中では行順。

skills/census/scripts/list-source-files.py の形に倣う (判定を module の定数として持ち、
対象集合を辿って要素ごとに 1 行出力する薄い main()) — ゼロから別のスクリプト構成を
組み立てない。

呼び出し側との取り決め: import の前に skills/_lib を sys.path へ置くのは呼び出し側
(skills/ablate/tests/enforcer_map_test.py、skills/ablate/tests/report_enforcer_test.py、
skills/ablate/scripts/report.py 経由の呼び出し)。このモジュール自身は sys.path を触らない。

テスト実行時は CLI エントリポイントとして動かない: skills/ablate/tests/enforcer_map_test.py は
このモジュールを shell out せず import し、classify_line と 2 つの verdict 定数を使う
(docs/wiki/deterministic-script-judgment.md「入力から一意に決まる判定は script に置く」)。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import harness_elements

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


def target_files(root: Path) -> list[str]:
    """`root` の harness が、すべてのセッションのコンテキストへ常時ロードするファイルの
    repo ルート相対 path。実行時に harness_elements から導出する。tuple へ手で書き写すと、
    あとから追加された rules/**/*.md が黙って対応表から落ちる。skills/ablate/scripts/report.py
    は同じ集合を自分の enumerate_elements 呼び出しから描画するので、綴りが 2 つあると
    1 つのレポートに食い違う 2 つの一覧が載る
    (docs/wiki/harness-production-divergence.md「供給の一覧を実行側の定数として持つ」)。"""
    return [
        element["path"]
        for element in harness_elements.enumerate_elements(root)
        if element["classification"] == harness_elements.ALWAYS_LOADED
    ]


def map_all(root: Path) -> list[dict[str, object]]:
    """常時ロードされる各ファイルの空行以外の各行を、ファイル順・その中では行順に分類する。
    main() と skills/ablate/scripts/report.py の両方が使う。"""
    results: list[dict[str, object]] = []
    for rel_path in target_files(root):
        results.extend(classify_file(root, rel_path))
    return results


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: enforcer_map.py <repo-root>", file=sys.stderr)
        return 2
    print(json.dumps(map_all(Path(argv[1])), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
