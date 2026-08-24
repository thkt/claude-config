#!/usr/bin/env python3
"""Usage: revalidate.py   (preconditions JSON on stdin)

Deterministically re-verify a plan's preconditions against the working tree.

stdin:  JSON array of {path, pattern?} — existing code the issue's plan presupposes.
        path is relative to the process cwd (the repo root). pattern is an optional
        literal (fixed-string, not regex) substring expected to occur in that file.
stdout: JSON {results: [{path, pattern, exists, matches}]}, one per input in order.
          exists  = the path is present; with a pattern, it is a regular file
          matches = with no pattern, equals exists; otherwise exists AND the literal
                    pattern occurs in the file's bytes
exit 0 on a completed run (read the verdict from JSON). exit 1 on usage / parse error
-- fail-closed: a malformed payload is never silently treated as "all preconditions
pass". The drift decision (any exists=false or matches=false) stays in build.js.
"""

import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import NoReturn, cast


def verify_one(root: Path, entry: object) -> dict[str, str | bool]:
    """A non-object entry, or one whose file is unreadable, resolves to
    exists/matches false (fail-closed) rather than raising."""
    mapping: dict[str, object] = cast("dict[str, object]", entry) if isinstance(entry, dict) else {}
    path = str(mapping.get("path", ""))
    raw_pattern = mapping.get("pattern", "")
    pattern = "" if raw_pattern is None else str(raw_pattern)
    # Not is_file() throughout: reference_module.path names a directory.
    target = root / path
    exists = bool(path) and (target.is_file() if pattern else target.exists())
    if not pattern:
        matches = exists
    elif not exists:
        matches = False
    else:
        try:
            matches = pattern.encode("utf-8") in target.read_bytes()
        except OSError:
            matches = False
    return {"path": path, "pattern": pattern, "exists": exists, "matches": matches}


def run(preconditions: Sequence[object], root: Path | None = None) -> list[dict[str, str | bool]]:
    base = Path() if root is None else root
    return [verify_one(base, entry) for entry in preconditions]


def fail(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    try:
        loaded = cast("object", json.loads(sys.stdin.read()))
    except json.JSONDecodeError as exc:
        fail(f"Error: preconditions is not valid JSON: {exc}")
    if not isinstance(loaded, list):
        fail("Error: preconditions must be a JSON array of {path, pattern?}")
    print(json.dumps({"results": run(cast("list[object]", loaded))}))


if __name__ == "__main__":
    main()
