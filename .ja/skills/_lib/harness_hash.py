#!/usr/bin/env python3
"""Usage: harness_hash.py <skill-name>

stdout: JSON { definition_sha256, skill_sha256, corpus_sha256 }
exit: 成功なら 0、reviewer 定義か corpus が無ければ 1、引数が無ければ 2

2 つのハッシュは、その精度計測が何を測ったかを名乗る。記録がこれを持つことで、鮮度ゲートは
現在の reviewer を測った実行と古い reviewer を測った実行を区別できる。実行日付では区別できない。
CI の checkout が浅く、日付と比べる履歴を持たないためである。
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# reviewer の振る舞いは agent 定義と skill 本文の両方が決めるので、別々のキーで名乗る。
# corpus は reviewer が判定される全ファイルと解答キーである。expected.json に対応する項目の無い
# ケースを足してもハッシュは変わる。その実行が別の corpus を見たという意味なので、それでよい。
CORPUS_PARTS = ("cases", "expected.json")


def _digest(pairs: list[tuple[str, bytes]]) -> str:
    """(path, content) の組をパス順に並べて 1 つのダイジェストにする。走査順に依存させない。"""
    h = hashlib.sha256()
    for name, content in sorted(pairs):
        h.update(name.encode("utf-8"))
        h.update(b"\0")
        h.update(content)
        h.update(b"\0")
    return h.hexdigest()


def agent_name(skill: str) -> str:
    """use-context skill が起動する reviewer。skill 自身の名前から読む。"""
    return skill.replace("use-context-", "")


def definition_path(skill: str) -> Path:
    return ROOT / "agents" / "reviewers" / f"{agent_name(skill)}.md"


def skill_path(skill: str) -> Path:
    return ROOT / "skills" / skill / "SKILL.md"


def corpus_files(skill: str) -> list[Path]:
    base = ROOT / "skills" / skill / "test"
    found: list[Path] = []
    for part in CORPUS_PARTS:
        target = base / part
        if target.is_dir():
            found.extend(p for p in sorted(target.rglob("*")) if p.is_file())
        elif target.is_file():
            found.append(target)
    return found


def hashes(skill: str) -> dict[str, str]:
    definition = definition_path(skill)
    if not definition.is_file():
        raise FileNotFoundError(f"no reviewer definition for {skill}: {definition}")
    files = corpus_files(skill)
    if not files:
        raise FileNotFoundError(f"no corpus for {skill}")
    base = ROOT / "skills" / skill / "test"
    body = skill_path(skill)
    if not body.is_file():
        raise FileNotFoundError(f"no SKILL.md for {skill}: {body}")
    return {
        "definition_sha256": _digest([(definition.name, definition.read_bytes())]),
        "skill_sha256": _digest([(body.name, body.read_bytes())]),
        "corpus_sha256": _digest([(str(p.relative_to(base)), p.read_bytes()) for p in files]),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        print(json.dumps(hashes(argv[1]), ensure_ascii=False))
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
