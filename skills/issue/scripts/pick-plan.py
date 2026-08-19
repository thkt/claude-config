#!/usr/bin/env python3
"""Usage: pick-plan.py <issue-title | plan-path> [planning-dir]

Extracts a plan draft's sections verbatim, and ranks the drafts when the path is not known.

Given a `.plan.md` path, it extracts that file and nothing else. That is the normal case: the
conversation carries the draft /think just wrote.

Given a title, it ranks the directory. The slug comes from the title handed to /think and the
issue carries a title someone wrote separately, so the two rarely match as strings. Ranking is a
shared-word score, and a draft is chosen only when one scores alone. A tie is handed back for
the caller to ask about rather than resolved by guessing.

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

DEFAULT_DIR = Path(".claude/workspace/planning")
# /think writes YYYY-MM-DD-<slug>.plan.md. The date is in the name, so the newest draft is decided
# without reading mtime, which no tool the issue skill is allowed to use can report.
NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)\.plan\.md$")
SECTION = re.compile(r"^## (.+?)\s*$", flags=re.MULTILINE)


def slugify(title: str) -> str:
    """The title reduced to /think's slug shape: lowercase, hyphen-separated.

    The type prefix goes first. `[Feature] Add CSV export` is filed under add-csv-export, so
    leaving the bracket in would stop every title from matching its own draft.
    """
    text = unicodedata.normalize("NFKC", title)
    text = re.sub(r"^\[[A-Za-z]+\]\s*", "", text)
    text = re.sub(r"[^\w\s-]", " ", text, flags=re.UNICODE)
    return "-".join(text.lower().split())


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


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: pick-plan.py <issue-title> [planning-dir]", file=sys.stderr)
        sys.exit(1)
    argument = sys.argv[1]
    directory = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_DIR

    given = Path(argument)
    if given.suffix == ".md" and given.is_file():
        text = given.read_text(encoding="utf-8")
        parsed = NAME.match(given.name)
        print(
            json.dumps(
                {
                    "path": str(given),
                    "slug": parsed.group(2) if parsed else None,
                    "date": parsed.group(1) if parsed else None,
                    "plan": section(text, "Plan"),
                    "backlog": section(text, "Backlog candidates"),
                    "candidates": [],
                    "ambiguous": False,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    wanted = slugify(argument)

    words = {w for w in wanted.split("-") if len(w) > 2}
    rows = []
    if directory.is_dir():
        for entry in sorted(directory.iterdir()):
            parsed = NAME.match(entry.name)
            if not parsed:
                continue
            slug = parsed.group(2)
            score = len(words & {w for w in slug.split("-") if len(w) > 2})
            rows.append({"path": str(entry), "slug": slug, "date": parsed.group(1), "score": score})
    rows.sort(key=lambda r: (-r["score"], r["date"]), reverse=False)
    rows.sort(key=lambda r: (r["score"], r["date"]), reverse=True)

    scored = [r for r in rows if r["score"] > 0]
    top = [r for r in scored if r["score"] == scored[0]["score"]] if scored else []
    result: dict[str, object] = {
        "path": None,
        "slug": None,
        "date": None,
        "plan": None,
        "backlog": None,
        "candidates": rows,
        "ambiguous": len(top) > 1,
    }
    if len(top) == 1:
        chosen = Path(top[0]["path"])
        text = chosen.read_text(encoding="utf-8")
        result.update(
            path=top[0]["path"],
            slug=top[0]["slug"],
            date=top[0]["date"],
            plan=section(text, "Plan"),
            backlog=section(text, "Backlog candidates"),
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
