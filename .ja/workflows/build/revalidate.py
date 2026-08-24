#!/usr/bin/env python3
"""Usage: revalidate.py   (preconditions JSON on stdin)

plan の precondition を working tree に対して決定的に再検証する。

stdin:  {path, pattern?} の JSON 配列。issue の plan が前提とする既存コード。
        path は process cwd (repo root) からの相対。pattern は任意で、その
        ファイルに含まれるはずの literal (fixed-string、regex ではない) 部分文字列。
stdout: JSON {results: [{path, pattern, exists, matches}]}、入力順に 1 件ずつ。
          exists  = path が実在する。pattern 有りなら通常ファイルであること
          matches = pattern 無しなら exists と同じ。pattern 有りなら exists かつ
                    その literal pattern がファイルの bytes に出現する
完了時は exit 0 (verdict は JSON から読む)。usage / parse error 時は exit 1。
fail-closed で、壊れた payload を「全 precondition pass」と黙って扱うことはない。
drift 判定 (exists=false / matches=false のいずれか) は build.js 側に残る。
"""

import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import NoReturn, cast


def verify_one(root: Path, entry: object) -> dict[str, str | bool]:
    """非オブジェクトの entry、または読めないファイルの entry は、例外を投げず
    exists/matches を false に解決する (fail-closed)。"""
    mapping: dict[str, object] = cast("dict[str, object]", entry) if isinstance(entry, dict) else {}
    path = str(mapping.get("path", ""))
    raw_pattern = mapping.get("pattern", "")
    pattern = "" if raw_pattern is None else str(raw_pattern)
    # 一律 is_file() にはしない。reference_module.path はディレクトリを指す (#494)。
    target = root / path
    exists = bool(path) and (target.is_file() if pattern else target.exists())
    if not pattern:
        matches = exists
    elif not exists:
        matches = False
    else:
        try:
            matches = pattern.encode("utf-8") in target.read_bytes()
        except OSError:
            matches = False
    return {"path": path, "pattern": pattern, "exists": exists, "matches": matches}


def run(preconditions: Sequence[object], root: Path | None = None) -> list[dict[str, str | bool]]:
    base = Path() if root is None else root
    return [verify_one(base, entry) for entry in preconditions]


def fail(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    try:
        loaded = cast("object", json.loads(sys.stdin.read()))
    except json.JSONDecodeError as exc:
        fail(f"Error: preconditions is not valid JSON: {exc}")
    if not isinstance(loaded, list):
        fail("Error: preconditions must be a JSON array of {path, pattern?}")
    print(json.dumps({"results": run(cast("list[object]", loaded))}))


if __name__ == "__main__":
    main()
