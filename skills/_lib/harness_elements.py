#!/usr/bin/env python3
"""Usage: harness_elements.py <repo-root>

Enumerates the harness files under <repo-root> matching POPULATION_GLOBS and
classifies each into one of always-loaded / path-triggered / glob-triggered / non-prompt.

stdout: JSON array of { path, classification }, path relative to <repo-root>
exit: 0 on success, 2 without an argument

Not a from-scratch YAML parser: PyYAML is not installed in this environment, and the
two frontmatter shapes in play (`globs: [...]` on one line, `paths:` followed by
`  - "..."` lines) are narrow enough that hand-parsing the two shapes stays smaller
than adding a dependency for them (rules/PRINCIPLES.md Reuse Ordering).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import TypedDict

ALWAYS_LOADED = "always-loaded"
PATH_TRIGGERED = "path-triggered"
GLOB_TRIGGERED = "glob-triggered"
NON_PROMPT = "non-prompt"

# The population's supply list, held as a script constant rather than a prose contract
# (docs/wiki/harness-production-divergence.md). enumerate_elements reads this constant to
# know where to look; a test that wants a real instance of the population reads it too
# (skills/_lib/tests/harness_elements_test.py), instead of hand-copying a path that can
# drift from what this module actually scans.
#
# Every pattern is anchored on a literal top-level segment (never on a bare "**"), so a
# `.ja/` mirror living beside each of these trees is never traversed by these globs: one
# canonical match is one population member, and rules/conventions/MIRROR.md's "a file and
# its .ja mirror count as one element" holds by construction rather than by a dedup pass.
POPULATION_GLOBS = (
    "rules/**/*.md",
    "docs/wiki/**/*.md",
    "CLAUDE.md",
    "skills/**/*.md",
    "skills/**/scripts/*.py",
    "agents/**/*.md",
    "hooks/**/*.py",
    "hooks/**/*.md",
)


class HarnessElement(TypedDict):
    path: str
    classification: str


def _frontmatter_lines(path: Path) -> list[str] | None:
    """The lines strictly between the opening and closing `---` delimiters, or None when
    the file carries no frontmatter block at all (distinct from an empty block)."""
    lines = path.read_text(encoding="utf-8").split("\n")
    if not lines or lines[0] != "---":
        return None
    for i, line in enumerate(lines[1:], start=1):
        if line == "---":
            return lines[1:i]
    return None


def _unquote(item: str) -> str:
    if len(item) >= 2 and item[0] == item[-1] and item[0] in ("'", '"'):
        return item[1:-1]
    return item


def _read_array(lines: list[str], key: str) -> list[str]:
    """Reads a frontmatter array in either shape this repo's harness files use: a
    single-line JSON array (`globs: ["a", "b"]`, as in docs/wiki/*.md) or a multi-line
    YAML dash list (`paths:` followed by `  - "a"` lines, as in rules/**/*.md)."""
    prefix = f"{key}:"
    for i, line in enumerate(lines):
        if not line.startswith(prefix):
            continue
        rest = line[len(prefix) :].strip()
        if rest:
            try:
                value = json.loads(rest)
            except json.JSONDecodeError:
                return []
            if not isinstance(value, list):
                return []
            return [v for v in value if isinstance(v, str)]
        items: list[str] = []
        for follow in lines[i + 1 :]:
            stripped = follow.strip()
            if not stripped.startswith("-"):
                break
            items.append(_unquote(stripped[1:].strip()))
        return items
    return []


def classify(path: Path) -> str:
    """Classifies one harness file. Read top to bottom, first match taken
    (skills/census/SKILL.md Phase 4's table shape): a non-.md file is never prompt
    content; a rules/**/*.md file (or the root CLAUDE.md) with no frontmatter is always
    loaded and one carrying a non-empty `paths` key is path-triggered; a docs/wiki/**/*.md
    page with a non-empty `globs` key is glob-triggered. Everything else the population
    can hold (a SKILL.md invoked by name, a reviewer definition loaded only when spawned,
    a script that is executed rather than injected as prose) is non-prompt."""
    if path.suffix != ".md":
        return NON_PROMPT

    parts = path.parts
    lines = _frontmatter_lines(path)

    if "rules" in parts or path.name == "CLAUDE.md":
        if lines is None:
            return ALWAYS_LOADED
        if _read_array(lines, "paths"):
            return PATH_TRIGGERED
        return NON_PROMPT

    if "docs" in parts and "wiki" in parts:
        if lines is not None and _read_array(lines, "globs"):
            return GLOB_TRIGGERED
        return NON_PROMPT

    return NON_PROMPT


def enumerate_elements(root: Path) -> list[HarnessElement]:
    """Scans POPULATION_GLOBS under root and classifies each match. A pattern never
    reaches into `.ja/` (see POPULATION_GLOBS), so a mirrored file surfaces once, through
    its canonical side alone."""
    seen: dict[str, HarnessElement] = {}
    for pattern in POPULATION_GLOBS:
        for match in root.glob(pattern):
            if not match.is_file():
                continue
            rel = match.relative_to(root).as_posix()
            if rel not in seen:
                seen[rel] = {"path": rel, "classification": classify(match)}
    return [seen[key] for key in sorted(seen)]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    elements = enumerate_elements(Path(argv[1]))
    print(json.dumps(elements, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
