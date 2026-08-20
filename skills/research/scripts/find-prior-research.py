#!/usr/bin/env python3
"""Usage: find-prior-research.py <slug> <search-dir>

Counts how many words a filename shares with the slug and returns every .md file with an
overlap, in descending order. A filename's date prefix (YYYY-MM-DD-) stays out of the matching.

stdout: JSON { candidates: [{file, shared}, ...], slug_words: int }  (shared descending)
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
    """The set of words in text, split on "-"."""
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

    # A one-word slug never reaches shared 2. Returning the word count lets the caller tell a
    # complete match from a partial one.
    print(json.dumps({"candidates": candidates, "slug_words": len(slug_words)}, indent=2))
    sys.exit(0)


if __name__ == "__main__":
    main()
