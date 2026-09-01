"""List source files in a tree, largest first.

Usage: list-source-files.py <repo-root>
Output: "<lines> <path>" per line.
Exit: 0, or 3 when the count exceeds SOURCE_CAP (the list is still printed, and stderr says so).
"""

import os
import sys
from collections.abc import Iterator
from pathlib import Path

EXTS = (".rs", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".swift")
# .ja is a translation mirror and counts as one element with its English side
# (rules/conventions/MIRROR.md).
PRUNE = {"target", "node_modules", ".git", "dist", "build", ".venv", "__pycache__", ".ja"}

# Past this many files, Phase 1 asks the user to narrow the scope before the reviewer fan-out.
SOURCE_CAP = 20
EXIT_OVER_CAP = 3


def source_files(root: str) -> Iterator[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        # Rebinding dirnames leaves os.walk pruning nothing.
        dirnames[:] = [d for d in dirnames if d not in PRUNE]
        for name in filenames:
            if name.endswith(EXTS):
                yield Path(dirpath) / name


def count_lines(path: Path) -> int | None:
    try:
        with path.open("rb") as fh:
            return sum(1 for _ in fh)
    except OSError:
        # One unreadable file (permissions, a broken symlink) must not stop the listing.
        return None


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: list-source-files.py <repo-root>", file=sys.stderr)
        return 2
    results: list[tuple[int, str]] = []
    for path in source_files(sys.argv[1]):
        lines = count_lines(path)
        if lines is not None:
            results.append((lines, str(path)))
    for lines, path in sorted(results, reverse=True):
        print(f"{lines} {path}")
    if len(results) > SOURCE_CAP:
        print(f"over cap: {len(results)} files exceed SOURCE_CAP={SOURCE_CAP}", file=sys.stderr)
        return EXIT_OVER_CAP
    return 0


if __name__ == "__main__":
    sys.exit(main())
