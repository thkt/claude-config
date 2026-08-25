#!/usr/bin/env python3
"""Usage: find_wiki_rule.py <wiki-dir> <slug> [file ...] [--scene <scene>]

Ranks the rule pages under <wiki-dir> for a task. A page whose globs match one of the given
files is a hard match; a page whose filename shares a word with the slug is a soft one.
`--scene` additionally lists pages whose frontmatter `scenes` includes it; the value must be
one some page in <wiki-dir> declares, or the run exits 2.

stdout: JSON { matched: [{page, globs, files}], related: [{page, shared}] } normally,
        plus scenes: [page] when --scene is given
exit: 0, or 2 on a missing argument or an unknown --scene value
"""

import json
import re
import sys
from pathlib import Path
from typing import TypedDict, cast

# README indexes the directory and _candidates holds rows below the threshold. Neither is a rule.
NOT_A_RULE = {"README.md", "_candidates.md"}

# The same subset workflows/code.js's globToRegExp accepts: `**/` crosses directories, `*` stops
# at one. Keeping the two in step is what glob-parity guards; widening one side alone would make
# a page reach an implementation the other side never routes to.
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
    """Strip a leading `./` or `/` from both sides so the prefix does not decide the match."""
    return re.sub(r"^(?:\./|/)+", "", str(path))


def _frontmatter_lines(page: Path) -> list[str]:
    """The lines between the opening and closing `---` delimiters, or none when the page
    carries no frontmatter block. Following the delimiter rather than a fixed line count is
    what lets a page order `scenes` ahead of `globs` without pushing `globs` out of view.
    """
    lines = page.read_text(encoding="utf-8").split("\n")
    if not lines or lines[0] != "---":
        return []
    for i, line in enumerate(lines[1:], start=1):
        if line == "---":
            return lines[1:i]
    return []


def _read_frontmatter_array(page: Path, key: str) -> list[str]:
    """The `<key>:` line of the frontmatter, or an empty list when the page carries none.

    A value that is not an array reads as empty too. Iterating `globs: "**/*"` as written turns
    each character into a glob, which makes the page look like it matches every file.
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
    """The globs line of the frontmatter, or an empty list when the page carries none."""
    return _read_frontmatter_array(page, "globs")


def read_scenes(page: Path) -> list[str]:
    """The scenes line of the frontmatter, read the same way as `read_globs`."""
    return _read_frontmatter_array(page, "scenes")


def words(text: str) -> set[str]:
    return {w for w in re.split(r"[-_\s]+", text.lower()) if w}


def find(wiki_dir: str, slug: str, files: list[str], *, scene: str | None = None) -> Report:
    pages = sorted(p for p in Path(wiki_dir).glob("*.md") if p.name not in NOT_A_RULE)
    normalized = [normalize(f) for f in files]
    slug_words = words(slug)
    page_scenes = {page: read_scenes(page) for page in pages}

    # The set of scenes this wiki_dir actually declares is the closed set a --scene value is
    # checked against; nothing outside it is a scene the caller could have meant.
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

    # A page whose rule bears on a file this plan touches outranks one that only shares a word.
    matched.sort(key=lambda m: -len(m["files"]))
    related.sort(key=lambda r: -r["shared"])
    return {"matched": matched, "related": related, "scenes": scenes}


def _split_scene_flag(argv: list[str]) -> tuple[list[str], str | None]:
    """Pulls a `--scene <value>` pair out of argv, returning the rest as positional args."""
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

    # Preserving the pre-scene 2-key shape when --scene is absent is what keeps every existing
    # caller (skills/think, skills/fix) byte-for-byte unaffected by this axis's addition.
    output: dict[str, object] = {"matched": report["matched"], "related": report["related"]}
    if scene is not None:
        output["scenes"] = report["scenes"]
    print(json.dumps(output, ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
