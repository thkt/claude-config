#!/usr/bin/env python3
"""ablate skill のためのレポート組み立て。

CLI のエントリポイントではない。skills/ablate/SKILL.md は script として呼ぶのでなく
`build_report` と `write_report` を import して使う。このモジュールがまとめる判定はすでに
それぞれの script が持つ (docs/wiki/deterministic-script-judgment.md「入力から一意に決まる
判定は script に置く」) ため、それらの定数をここで再導出しない。

このモジュールのディレクトリと skills/_lib を import 前に sys.path へ入れるのは呼び出し側。
report.py 自身は sys.path を操作しない。
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

import arms
import dr_gate
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


def build_report(root: Path, observations: list[dict[str, Any]]) -> dict[str, Any]:
    """前段の各ユニットの script を順に呼び、その出力を結線する。

    dr_gate.gate は verdict.classify の片側判定の後、結果が write_report へ渡る前に走る
    ため、差し止められた候補は下の delete_candidates に決して現れない。

    レポート文字列でなく素の dict を返すため、データだけを必要とする呼び出し側は
    write_report の出力から Markdown を読み戻さずに済む。
    """
    elements = harness_elements.enumerate_elements(root)

    verdicts: dict[str, str] = {}
    for observation in observations:
        path = observation["path"]
        raw_verdict = verdict.classify(
            trigger_task=observation.get("trigger_task"),
            task_set=observation.get("task_set"),
            complies=observation.get("complies"),
        )
        verdicts[path] = dr_gate.gate(path=path, verdict=raw_verdict, root=root)

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
        "enforcer_rows": enforcer_map.map_all(root),
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
            # 別に数える。この行が無いと、Verdicts の表を held の文字列で走査しない限り
            # 件数が分からない。
            (
                "Held by a live DR",
                str(sum(1 for v in result["verdicts"].values() if v == dr_gate.HELD)),
            ),
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
