#!/usr/bin/env python3
"""Usage: verify-tests.py   (test-presence checks JSON on stdin)

Deterministically verify that each plan test statement (T-NNN name) occurs in one
of its unit's files. code.js instructs the implementation to use the scenario name
verbatim as the test name, so a fixed-string search is a presence check for
"this planned test was actually written".

stdin:  JSON array of {files, names} — one entry per plan unit. files are
        repo-root-relative paths (the unit's own files, tests included); names
        are the unit's T-NNN statements.
stdout: JSON {results: [{name, found}]}, names flattened in input order.
          found = some listed file is a regular readable file containing the
                  name literally (not regex), ignoring whitespace differences
exit 0 on a completed run (read the verdict from JSON). exit 1 on usage / parse
error -- fail-closed: a malformed payload is never silently treated as "all
statements present". The surfacing decision (found=false -> PR) stays in build.js.
"""

import json
import re
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import NoReturn, cast

# textlint spaces the issue body's markdown between half- and full-width characters
# ("0件" becomes "0 件") but leaves a test file's string literal alone. The plan is read
# from the issue body, so matching without dropping whitespace reports an existing test
# as found=false. \s covers the full-width space too.
_WHITESPACE = re.compile(r"\s+")


def squeeze(text: str) -> str:
    return _WHITESPACE.sub("", text)


def read_text(root: Path, path: str) -> str:
    """The file's text, or empty on a missing / unreadable file (fail-closed)."""
    target = root / path
    if not target.is_file():
        return ""
    try:
        return target.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _strings(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in cast("list[object]", value) if item]


def run(checks: Sequence[object], root: Path | None = None) -> list[dict[str, object]]:
    base = Path() if root is None else root
    results: list[dict[str, object]] = []
    for entry in checks:
        if not isinstance(entry, dict):
            continue
        mapping = cast("dict[str, object]", entry)
        files = _strings(mapping.get("files"))
        names = _strings(mapping.get("names"))
        contents = [squeeze(read_text(base, f)) for f in files]
        for name in names:
            # A whitespace-only name squeezes to empty, which every file would contain.
            needle = squeeze(name)
            results.append(
                {
                    "name": name,
                    "found": bool(needle) and any(needle in c for c in contents),
                }
            )
    return results


def fail(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    try:
        loaded = cast("object", json.loads(sys.stdin.read()))
    except json.JSONDecodeError as exc:
        fail(f"Error: checks is not valid JSON: {exc}")
    if not isinstance(loaded, list):
        fail("Error: checks must be a JSON array of {files, names}")
    print(json.dumps({"results": run(cast("list[object]", loaded))}))


if __name__ == "__main__":
    main()
