#!/usr/bin/env python3
"""Usage: find-prior-research.py <slug> <search-dir>

slug の語とファイル名の語の重なり数を数え、重なりを持つ .md ファイルを降順で返す。
ファイル名の日付プレフィックス (YYYY-MM-DD-) は語の照合対象から外れる。

stdout: JSON { candidates: [{file, shared}, ...] }  (shared 降順)
exit: 0
"""

import json
import re
import sys
from pathlib import Path
from typing import TypedDict

DATE_PREFIX = re.compile(r"^\d{4}-\d{2}-\d{2}-")


class Candidate(TypedDict):
    file: str
    shared: int


def words(text: str) -> set[str]:
    """text を "-" 区切りで語集合にする。"""
    return {w for w in text.split("-") if w}


def main() -> None:
    slug = sys.argv[1] if len(sys.argv) > 1 else ""
    search_dir = sys.argv[2] if len(sys.argv) > 2 else ""
    slug_words = words(slug)

    candidates: list[Candidate] = []
    directory = Path(search_dir)
    if directory.is_dir():
        for path in directory.iterdir():
            if not path.is_file() or path.suffix != ".md":
                continue
            stem = DATE_PREFIX.sub("", path.stem)
            shared = len(slug_words & words(stem))
            if shared > 0:
                candidates.append({"file": path.name, "shared": shared})
        candidates.sort(key=lambda c: c["shared"], reverse=True)

    print(json.dumps({"candidates": candidates}, indent=2))
    sys.exit(0)


if __name__ == "__main__":
    main()
