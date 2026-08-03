#!/usr/bin/env python3
"""Usage: verify-tests.py   (test-presence checks JSON on stdin)

plan の各 test 文 (T-NNN の name) が、その unit のファイルのいずれかに原文のまま
現れることを決定的に検証する。code.js は実装に対し、シナリオ名をそのまま test 名に
使うよう指示する。よって固定文字列の検索が「計画した test が実際に書かれたか」の
存在確認になる。

stdin:  {files, names} の JSON 配列。plan の unit ごとに 1 要素。files は repo root
        からの相対パス (その unit 自身のファイル。test を含む)。names はその unit の
        T-NNN 文。
stdout: JSON {results: [{name, found}]}。names は入力順に平坦化する。
          found = 列挙されたファイルのいずれかが読める通常ファイルで、name のバイト列を
                  そのまま (正規表現でなく) 含む
完走したら exit 0 (判定は JSON から読む)。usage と parse の失敗は exit 1。fail-closed に
する。壊れた payload を「全ての文が存在する」と黙って扱わないため。found=false を
どう surface するかの判断は build.js が持つ。
"""

import json
import sys
from pathlib import Path


def read_bytes(root, path):
    """ファイルのバイト列。存在しない / 読めないときは空を返す (fail-closed)。"""
    target = root / path
    if not target.is_file():
        return b""
    try:
        return target.read_bytes()
    except OSError:
        return b""


def run(checks, root=Path(".")):
    """各 unit の names をその unit 自身のファイルに照合する。入力順を保つ。"""
    results = []
    for entry in checks:
        if not isinstance(entry, dict):
            continue
        files = [str(f) for f in entry.get("files", []) if f]
        names = [str(n) for n in entry.get("names", []) if n]
        contents = [read_bytes(root, f) for f in files]
        for name in names:
            needle = name.encode("utf-8")
            results.append(
                {"name": name, "found": any(needle in c for c in contents)}
            )
    return results


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


def main():
    try:
        checks = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        fail(f"Error: checks is not valid JSON: {exc}")
    if not isinstance(checks, list):
        fail("Error: checks must be a JSON array of {files, names}")
    print(json.dumps({"results": run(checks)}))


if __name__ == "__main__":
    main()
