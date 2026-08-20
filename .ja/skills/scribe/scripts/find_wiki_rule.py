#!/usr/bin/env python3
"""Usage: find_wiki_rule.py <wiki-dir> <slug> [file ...]

<wiki-dir> の決まりごとページを、そのタスクに対して順位付けする。globs が渡されたファイルに
一致するページは確実な一致、ファイル名が slug と語を共有するページは弱い一致。

stdout: JSON { matched: [{page, globs, files}], related: [{page, shared}] }
exit: 0
"""

import json
import re
import sys
from pathlib import Path
from typing import TypedDict

# README はディレクトリの索引、_candidates は閾値未満の行の置き場。どちらも決まりごとではない。
NOT_A_RULE = {"README.md", "_candidates.md"}

# workflows/code.js の globToRegExp が受ける部分集合と同じ。`**/` はディレクトリを跨ぎ、`*` は
# 1 階層で止まる。片側だけ広げると、ページが届く実装と routing の届く実装が食い違う。
_SEGMENT = re.compile(r"(\*\*/|\*)")
_ESCAPE = re.compile(r"[.+^${}()|\[\]\\]")


class Matched(TypedDict):
    page: str
    globs: list[str]
    files: list[str]


class Related(TypedDict):
    page: str
    shared: int


class Report(TypedDict):
    matched: list[Matched]
    related: list[Related]


def glob_to_regexp(glob: str) -> re.Pattern[str]:
    body = "".join(
        "(?:.*/)?" if part == "**/" else "[^/]*" if part == "*" else _ESCAPE.sub(r"\\\g<0>", part)
        for part in _SEGMENT.split(glob)
    )
    return re.compile(f"^{body}$")


def normalize(path: str) -> str:
    """先頭の `./` と `/` を両側から落とし、接頭辞が一致を決めないようにする。"""
    return re.sub(r"^(?:\./|/)+", "", str(path))


def read_globs(page: Path) -> list[str]:
    """frontmatter の globs 行。ページが持たなければ空リスト。"""
    for line in page.read_text(encoding="utf-8").split("\n")[:4]:
        if line.startswith("globs:"):
            try:
                value = json.loads(line[len("globs:") :].strip())
            except json.JSONDecodeError:
                return []
            return [g for g in value if isinstance(g, str)]
    return []


def words(text: str) -> set[str]:
    return {w for w in re.split(r"[-_\s]+", text.lower()) if w}


def find(wiki_dir: str, slug: str, files: list[str]) -> Report:
    pages = sorted(p for p in Path(wiki_dir).glob("*.md") if p.name not in NOT_A_RULE)
    normalized = [normalize(f) for f in files]
    slug_words = words(slug)

    matched: list[Matched] = []
    related: list[Related] = []
    for page in pages:
        globs = read_globs(page)
        hits = [
            f for f in normalized if any(glob_to_regexp(normalize(g)).match(f) for g in globs)
        ]
        if hits:
            matched.append({"page": page.name, "globs": globs, "files": hits})
            continue
        shared = len(slug_words & words(page.stem))
        if shared:
            related.append({"page": page.name, "shared": shared})

    # plan が触るファイルに効くページを、語を共有するだけのページより先に置く。
    matched.sort(key=lambda m: -len(m["files"]))
    related.sort(key=lambda r: -r["shared"])
    return {"matched": matched, "related": related}


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: find_wiki_rule.py <wiki-dir> <slug> [file ...]", file=sys.stderr)
        sys.exit(2)
    print(json.dumps(find(sys.argv[1], sys.argv[2], sys.argv[3:]), ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
