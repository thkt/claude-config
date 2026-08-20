#!/usr/bin/env python3
"""Usage: find_wiki_rule.py <wiki-dir> <slug> [file ...]

Ranks the rule pages under <wiki-dir> for a task. A page whose globs match one of the given
files is a hard match; a page whose filename shares a word with the slug is a soft one.

stdout: JSON { matched: [{page, globs, files}], related: [{page, shared}] }
exit: 0
"""

import json
import re
import sys
from pathlib import Path
from typing import TypedDict

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


def glob_to_regexp(glob: str) -> re.Pattern[str]:
    body = "".join(
        "(?:.*/)?" if part == "**/" else "[^/]*" if part == "*" else _ESCAPE.sub(r"\\\g<0>", part)
        for part in _SEGMENT.split(glob)
    )
    return re.compile(f"^{body}$")


def normalize(path: str) -> str:
    """Strip a leading `./` or `/` from both sides so the prefix does not decide the match."""
    return re.sub(r"^(?:\./|/)+", "", str(path))


def read_globs(page: Path) -> list[str]:
    """The globs line of the frontmatter, or an empty list when the page carries none."""
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

    # A page whose rule bears on a file this plan touches outranks one that only shares a word.
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
