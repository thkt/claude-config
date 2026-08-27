#!/usr/bin/env python3
"""ablate skill のためのレポート組み立て。

CLI のエントリポイントではない。skills/ablate/SKILL.md はこのモジュールを script として
呼ぶのでなく、下の `build_report` と `write_report` を import して使う
(docs/wiki/deterministic-script-judgment.md 「入力から一意に決まる判定は script に置く」—
列挙・アーム一覧・verdict 分類・常時ロード / enforcer 対応づけはすでにそれぞれの script が
持っており、このモジュール自身の仕事はその 4 つを順に呼んで結果を呼び出し側へ渡すことだけで、
それらの定数をここで再導出しない。これは verdict.py の `from arms import UNMEASURED` という
兄弟 import の形に倣う)。

呼び出し側の契約: 呼び出し側 (現在は skills/ablate/tests/report_test.py と
skills/ablate/tests/report_enforcer_test.py、いずれ skills/ablate/SKILL.md) が、このモジュール
のディレクトリと skills/_lib を import 前に sys.path へ入れる。harness_elements.py と
verdict.py がそれぞれのテストから import されるのと同じ形であり、report.py 自身は sys.path
を操作しない。
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

import arms
import enforcer_map
import harness_elements
import verdict

# ablation apparatus 自身の script tree。ここ配下のパスは観測を生成したコードそのものであり
# 検査対象の harness 要素ではないため、delete_candidates に決して現れてはならない —
# 観測を続ける apparatus 自身を削除してしまうと、harness 要素を測り続ける能力そのものが
# 失われる (このユニットの T-015 契約「ablation apparatus 自身が delete candidates から
# 除かれている」)。
APPARATUS_DIR = "skills/ablate/"

REPORT_NAME = "ablate"


def _is_apparatus(path: str) -> bool:
    """`path` が APPARATUS_DIR 配下 (ablate skill 自身の tree。
    harness_elements.POPULATION_GLOBS の "skills/**/scripts/*.py" に、
    skills/ablate/scripts/report.py 自身がそうであるのと同じ形で一致する) にあるとき True。"""
    return PurePosixPath(path).as_posix().startswith(APPARATUS_DIR)


def _enforcer_rows(root: Path) -> list[dict[str, object]]:
    """enforcer_map.TARGET_FILES の空行以外の各行を enforcer_map.classify_file で分類した
    もの。ファイル順、その中では行順。enforcer_map.main() 自身のループが持つファイル存在
    ガード (対象ファイルが 1 つ (より狭いチェックアウト) 欠けても残りのマッピングを止めない)
    に倣う。main() は module の CLI エントリポイントで返り値でなく print するため、main() へ
    委譲するのでなくここで持つ。"""
    rows: list[dict[str, object]] = []
    for rel_path in enforcer_map.TARGET_FILES:
        if not (root / rel_path).is_file():
            continue
        rows.extend(enforcer_map.classify_file(root, rel_path))
    return rows


def build_report(root: Path, observations: list[dict[str, Any]]) -> dict[str, Any]:
    """前段の 4 ユニットを順に呼び、その出力を結線する。

    1. harness_elements.enumerate_elements(root) — harness の全母集団と各要素の分類。
    2. arms.ARMS — この ablation 実行が比較するすべてのアーム。
    3. observation ごとの verdict.classify(...) — その observation が報告する要素の
       delete-candidate / needs-human-judgment / unmeasured ラベル。
    4. enforcer_map.TARGET_FILES の各メンバーごとの enforcer_map.classify_file(...) —
       常時ロードされる各ファイル自身の行についての delete-candidate / ablation-residue
       ラベル。

    レポート文字列でなく素の dict (elements / arms / verdicts / delete_candidates /
    enforcer_rows) を返すため、データだけを必要とする呼び出し側 (このユニットのテスト、
    いずれ U-009 から U-011 が足す DR ゲートの結線) は write_report の出力から Markdown を
    読み戻さずに済む。
    """
    elements = harness_elements.enumerate_elements(root)

    verdicts: dict[str, str] = {}
    for observation in observations:
        verdicts[observation["path"]] = verdict.classify(
            trigger_task=observation.get("trigger_task"),
            task_set=observation.get("task_set"),
            complies=observation.get("complies"),
        )

    delete_candidates = [
        path
        for path in verdicts
        if verdicts[path] == verdict.DELETE_CANDIDATE and not _is_apparatus(path)
    ]

    return {
        "elements": elements,
        "arms": list(arms.ARMS),
        "verdicts": verdicts,
        "delete_candidates": sorted(delete_candidates),
        "enforcer_rows": _enforcer_rows(root),
    }


def _table(headers: tuple[str, ...], rows: list[tuple[str, ...]]) -> list[str]:
    """Markdown 表の見出し行、区切り行、データ行。_render がこの形の表を 5 つ
    (Summary、Harness Elements、Verdicts、Always-Loaded Elements、そして上の 2 列呼び出し側
    経由で他のすべての節) 別々の入力から組むので切り出した。ここで行の連結ルールを 1 箇所
    変えるとそのすべてが変わる。列数は `headers` から決まるため、2 列の呼び出し側とこの
    ユニットの 4 列 Always-Loaded Elements 表が同じ描画を共有する。"""
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return lines


def _render(result: dict[str, Any]) -> str:
    """`build_report` の結果を Markdown として描画する。build_report が返す key だけを
    読み、呼び出し側が渡した生の `observations` は決して読まないため、observation が
    自分の由来を示すために持つフィールド (実行に使われた settings のスナップショットなど) が
    書き出されたレポートに (逐語的にであれ) 混入することはない (T-014)。"""
    lines: list[str] = ["# Ablation Report", ""]

    lines += ["## Summary", ""]
    lines += _table(
        ("Metric", "Value"),
        [
            ("Harness elements enumerated", str(len(result["elements"]))),
            ("Arms", str(len(result["arms"]))),
            ("Elements observed", str(len(result["verdicts"]))),
            ("Delete candidates", str(len(result["delete_candidates"]))),
            ("Always-loaded lines mapped", str(len(result["enforcer_rows"]))),
        ],
    )
    lines += [""]

    lines += ["## Always-Loaded Elements", ""]
    lines += _table(
        ("File", "Line", "Verdict", "Enforcer"),
        [
            (
                row["file"],
                str(row["line_number"]),
                row["verdict"],
                row.get("enforcer", ""),
            )
            for row in result["enforcer_rows"]
        ],
    )
    lines += [""]

    lines += ["## Harness Elements", ""]
    lines += _table(
        ("Path", "Classification"),
        [(element["path"], element["classification"]) for element in result["elements"]],
    )
    lines += [""]

    lines += ["## Arms", ""]
    lines += [f"- {arm}" for arm in result["arms"]]
    lines += [""]

    lines += ["## Verdicts", ""]
    lines += _table(
        ("Path", "Verdict"),
        [(path, result["verdicts"][path]) for path in sorted(result["verdicts"])],
    )
    lines += [""]

    lines += ["## Delete Candidates", ""]
    if result["delete_candidates"]:
        lines += [f"- {path}" for path in result["delete_candidates"]]
    else:
        lines += ["No delete candidates."]
    lines += [""]

    return "\n".join(lines)


def write_report(
    root: Path, observations: list[dict[str, Any]], out_dir: Path | None = None
) -> Path:
    """`<out_dir>/<YYYY-MM-DD>-<HHMMSS>-ablate.md` へ UTC でレポートを書く (このモジュールの
    規約であり、skills/census/SKILL.md Phase 5 の `date -u +%Y-%m-%d-%H%M%S` という命名に
    倣うことで、タイムゾーンの異なる同日の再実行同士が衝突しないようにする)。`out_dir` の
    既定値は `<root>/docs/audit/` で、テストは実ツリーに書く代わりに一時ディレクトリを渡す。"""
    result = build_report(root, observations)
    content = _render(result)

    target_dir = out_dir if out_dir is not None else root / "docs" / "audit"
    target_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M%S")
    report_path = target_dir / f"{timestamp}-{REPORT_NAME}.md"
    report_path.write_text(content, encoding="utf-8")
    return report_path
