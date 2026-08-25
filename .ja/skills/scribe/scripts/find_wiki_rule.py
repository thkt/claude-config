#!/usr/bin/env python3
"""Usage: find_wiki_rule.py <wiki-dir> <slug> [file ...] [--scene <scene>]

<wiki-dir> の決まりごとページを、そのタスクに対して順位付けする。globs が渡されたファイルに
一致するページは確実な一致、ファイル名が slug と語を共有するページは弱い一致。
`--scene` を渡すと、frontmatter の scenes にその値を含むページを追加で列挙する。値は
<wiki-dir> 内のどれかのページが宣言している scene でなければならず、それ以外は終了コード 2。

stdout: 通常は JSON { matched: [{page, globs, files}], related: [{page, shared}] }
        --scene を渡したときは scenes: [page] も加わる
exit: 0。引数不足、または未知の --scene 値のときは 2
"""

import json
import re
import sys
from pathlib import Path
from typing import TypedDict, cast

# README はディレクトリの索引、_candidates は閾値未満の行の置き場。どちらも決まりごとではない。
NOT_A_RULE = {"README.md", "_candidates.md"}

# ページの frontmatter `scenes` が宣言してよい値の閉集合。ここではなく wiki ページ契約テスト
# 側でこの一覧を書き直すと、そちらとこのモジュールが別々の閉集合へ drift する。
SCENES = ["issue-close"]

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
    scenes: list[str]


def glob_to_regexp(glob: str) -> re.Pattern[str]:
    body = "".join(
        "(?:.*/)?" if part == "**/" else "[^/]*" if part == "*" else _ESCAPE.sub(r"\\\g<0>", part)
        for part in _SEGMENT.split(glob)
    )
    return re.compile(f"^{body}$")


def normalize(path: str) -> str:
    """先頭の `./` と `/` を両側から落とし、接頭辞が一致を決めないようにする。"""
    return re.sub(r"^(?:\./|/)+", "", str(path))


def _frontmatter_lines(page: Path) -> list[str]:
    """開始と終了の `---` に挟まれた行。frontmatter を持たないページでは空リスト。

    固定の行数ではなく終了デリミタを追うことで、`scenes` を `globs` より前に置いても
    `globs` が読み取り範囲の外へ押し出されない。
    """
    lines = page.read_text(encoding="utf-8").split("\n")
    if not lines or lines[0] != "---":
        return []
    for i, line in enumerate(lines[1:], start=1):
        if line == "---":
            return lines[1:i]
    return []


def _read_frontmatter_array(page: Path, key: str) -> list[str]:
    """frontmatter の `<key>:` 行。ページが持たなければ空リスト。

    配列でない値も空リストにする。`globs: "**/*"` を素直に回すと 1 文字ずつが glob になり、
    ページが全ファイルに一致したように見える。
    """
    prefix = f"{key}:"
    for line in _frontmatter_lines(page):
        if line.startswith(prefix):
            try:
                value = cast(object, json.loads(line[len(prefix) :].strip()))
            except json.JSONDecodeError:
                return []
            if not isinstance(value, list):
                return []
            return [g for g in cast(list[object], value) if isinstance(g, str)]
    return []


def read_globs(page: Path) -> list[str]:
    """frontmatter の globs 行。ページが持たなければ空リスト。"""
    return _read_frontmatter_array(page, "globs")


def read_scenes(page: Path) -> list[str]:
    """frontmatter の scenes 行。`read_globs` と同じ読み方で取り出す。"""
    return _read_frontmatter_array(page, "scenes")


def words(text: str) -> set[str]:
    return {w for w in re.split(r"[-_\s]+", text.lower()) if w}


def find(wiki_dir: str, slug: str, files: list[str], *, scene: str | None = None) -> Report:
    pages = sorted(p for p in Path(wiki_dir).glob("*.md") if p.name not in NOT_A_RULE)
    normalized = [normalize(f) for f in files]
    slug_words = words(slug)
    page_scenes = {page: read_scenes(page) for page in pages}

    # この wiki_dir が実際に宣言している scene の集合が、--scene 値を照合する閉集合になる。
    # その外側は呼び出し側が意図しえた scene ではない。
    if scene is not None and not any(scene in s for s in page_scenes.values()):
        raise ValueError(f"unknown scene: {scene!r}")

    matched: list[Matched] = []
    related: list[Related] = []
    scenes: list[str] = []
    for page in pages:
        globs = read_globs(page)
        hits = [f for f in normalized if any(glob_to_regexp(normalize(g)).match(f) for g in globs)]
        if hits:
            matched.append({"page": page.name, "globs": globs, "files": hits})
        else:
            shared = len(slug_words & words(page.stem))
            if shared:
                related.append({"page": page.name, "shared": shared})
        if scene is not None and scene in page_scenes[page]:
            scenes.append(page.name)

    # plan が触るファイルに効くページを、語を共有するだけのページより先に置く。
    matched.sort(key=lambda m: -len(m["files"]))
    related.sort(key=lambda r: -r["shared"])
    return {"matched": matched, "related": related, "scenes": scenes}


def _split_scene_flag(argv: list[str]) -> tuple[list[str], str | None]:
    """argv から `--scene <value>` の対を抜き出し、残りを位置引数として返す。"""
    if "--scene" not in argv:
        return argv, None
    i = argv.index("--scene")
    if i + 1 >= len(argv):
        return argv, None
    return argv[:i] + argv[i + 2 :], argv[i + 1]


def main() -> None:
    positional, scene = _split_scene_flag(sys.argv[1:])
    if len(positional) < 2:
        print(
            "usage: find_wiki_rule.py <wiki-dir> <slug> [file ...] [--scene <scene>]",
            file=sys.stderr,
        )
        sys.exit(2)
    wiki_dir, slug, *files = positional
    try:
        report = find(wiki_dir, slug, files, scene=scene)
    except ValueError as exc:
        print(f"find_wiki_rule: {exc}", file=sys.stderr)
        sys.exit(2)

    # --scene が無いときに旧来の 2 キー形を保つことで、既存の呼び出し元 (skills/think,
    # skills/fix) はこの軸の追加による影響を一切受けない。
    output: dict[str, object] = {"matched": report["matched"], "related": report["related"]}
    if scene is not None:
        output["scenes"] = report["scenes"]
    print(json.dumps(output, ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
