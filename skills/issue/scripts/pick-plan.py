#!/usr/bin/env python3
"""Usage: pick-plan.py <issue-title | plan-path> [planning-dir]

A path extracts that draft's sections; a title ranks the drafts in planning-dir.

stdout: JSON { path, slug, date, plan, backlog, candidates, ambiguous }
        path       chosen file, or null when zero or several drafts score
        plan       the `## Plan` section including its heading, or null
        backlog    the `## Backlog candidates` section including its heading, or null
        candidates every draft newest first, each { path, slug, date, score }
        ambiguous  true when several drafts tie the top score
exit: 0 always, including no match. A missing directory is a no-match, not a failure: an issue
      filed before any planning happened is the normal case and must not stop the skill.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import TypedDict

DEFAULT_DIR = Path(".claude/workspace/planning")
# The date comes from the name because no tool the issue skill may use reports mtime.
NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)\.plan\.md$")
SECTION = re.compile(r"^## (.+?)\s*$", flags=re.MULTILINE)


class Draft(TypedDict):
    """One draft, with the score it earned on words shared with the title."""

    path: str
    slug: str
    date: str
    score: int


def slugify(title: str) -> str:
    """The title reduced to /think's slug shape: lowercase, hyphen-separated.

    The type prefix goes first. `[Feature] Add CSV export` is filed under add-csv-export, so
    leaving the bracket in would stop every title from matching its own draft.
    """
    text = unicodedata.normalize("NFKC", title)
    text = re.sub(r"^\[[A-Za-z]+\]\s*", "", text)
    text = re.sub(r"[^\w\s-]", " ", text, flags=re.UNICODE)
    return "-".join(text.lower().split())


def scoring_words(slug: str) -> set[str]:
    """The words that count toward a score. Two letters or fewer match every slug."""
    return {w for w in slug.split("-") if len(w) > 2}


def section(text: str, name: str) -> str | None:
    """One `## <name>` section including its heading, up to the next h2 or the end."""
    for match in SECTION.finditer(text):
        if match.group(1) != name:
            continue
        rest = text[match.end() :]
        following = SECTION.search(rest)
        body = rest[: following.start()] if following else rest
        return (match.group(0) + body).rstrip() + "\n"
    return None


def extracted(path: Path) -> dict[str, object]:
    """The output values read from one draft."""
    text = path.read_text(encoding="utf-8")
    parsed = NAME.match(path.name)
    return {
        "path": str(path),
        "slug": parsed.group(2) if parsed else None,
        "date": parsed.group(1) if parsed else None,
        "plan": section(text, "Plan"),
        "backlog": section(text, "Backlog candidates"),
    }


def rank(title: str, directory: Path) -> list[Draft]:
    """Every draft in the directory, highest score first and newest first within a tie."""
    wanted = scoring_words(slugify(title))
    rows: list[Draft] = []
    if directory.is_dir():
        for entry in sorted(directory.iterdir()):
            parsed = NAME.match(entry.name)
            if not parsed:
                continue
            slug = parsed.group(2)
            rows.append(
                {
                    "path": str(entry),
                    "slug": slug,
                    "date": parsed.group(1),
                    "score": len(wanted & scoring_words(slug)),
                }
            )
    rows.sort(key=lambda r: (r["score"], r["date"]), reverse=True)
    return rows


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: pick-plan.py <issue-title | plan-path> [planning-dir]", file=sys.stderr)
        sys.exit(1)
    directory = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_DIR

    result: dict[str, object] = {
        "path": None,
        "slug": None,
        "date": None,
        "plan": None,
        "backlog": None,
        "candidates": [],
        "ambiguous": False,
    }
    given = Path(sys.argv[1])
    if given.suffix == ".md" and given.is_file():
        result |= extracted(given)
    else:
        rows = rank(sys.argv[1], directory)
        scored = [r for r in rows if r["score"] > 0]
        top = [r for r in scored if r["score"] == scored[0]["score"]] if scored else []
        result |= {"candidates": rows, "ambiguous": len(top) > 1}
        if len(top) == 1:
            result |= extracted(Path(top[0]["path"]))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
