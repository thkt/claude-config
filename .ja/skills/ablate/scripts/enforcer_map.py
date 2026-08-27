#!/usr/bin/env python3
"""常時ロードされる harness ファイルの enforcer 対応表。

Usage: enforcer_map.py <repo-root>。skills/_lib を PYTHONPATH に置いて実行する。
Output: 常時ロードされる各ファイルの空行以外の各行につき
{file, line_number, verdict, enforcer?} を 1 要素とする JSON 配列を標準出力へ。
ファイル順、その中では行順。

import の前に skills/_lib を sys.path へ置くのは呼び出し側。このモジュール自身は触らない。
skills/ablate/scripts/report.py が宣言している取り決めに従う。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import harness_elements

DELETE_CANDIDATE = "delete-candidate"
ABLATION_RESIDUE = "ablation-residue"

# 常時ロードされる行の完全一致テキスト -> それをすでに担保している enforcer。enforcer を
# 確認できなかった rule は推測せず表から外すため、表に無い行は誰も確かめていない担保では
# なく ABLATION_RESIDUE として出る。
ENFORCER_TABLE = {
    # settings.json は両ツリーを対象とする PostToolUse Edit/Write hook として guard を登録
    # しており、hooks/_lib/mirror_prose.py の警告はこの違反に対して "(MIRROR.md)" を引用する。
    "| Prose language | Japanese under `.ja/`, English everywhere else. Covers comments, "
    "test names, and assertion messages                                                   |": (
        "hooks/edit/mirror_prose_guard.py"
    ),
}


def classify_line(line: str) -> str:
    """`line` を担保する enforcer があるとき DELETE_CANDIDATE、無ければ ABLATION_RESIDUE。
    residue は keep の判定ではなく、削れば他の何も肩代わりしない保証が失われるという意味。"""
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
    repo ルート相対 path。tuple で持たず実行時に導出する。手で書き写した複製はあとから
    追加された rules/**/*.md を落とし、report.py は同じ集合を自分の enumerate_elements
    呼び出しから描画するので、綴りが 2 つあると 1 つのレポートに食い違う 2 つの一覧が載る
    (docs/wiki/harness-production-divergence.md「供給の一覧を実行側の定数として持つ」)。"""
    return [
        element["path"]
        for element in harness_elements.enumerate_elements(root)
        if element["classification"] == harness_elements.ALWAYS_LOADED
    ]


def map_all(root: Path) -> list[dict[str, object]]:
    """常時ロードされる各ファイルの空行以外の各行を、ファイル順・その中では行順に分類する。"""
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
