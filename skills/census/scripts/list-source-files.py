"""List source files in a tree, largest first; equal line counts order by path ascending.

Usage: list-source-files.py <repo-root | source-file>
Output: "<lines> <path>" per line. A file argument lists that file alone.
Exit: 0, or 3 when the count exceeds SOURCE_CAP (the list is still printed, and stderr says so),
      or 2 when the argument is missing or names neither a directory nor a file.
An entry that cannot be listed or read is skipped with one stderr line naming it, so the
listing never silently undercounts the tree.
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
EXIT_USAGE = 2


def _warn(message: str) -> None:
    print(f"warning: {message}", file=sys.stderr)


def source_files(root: str) -> Iterator[Path]:
    def on_walk_error(error: OSError) -> None:
        # os.walk drops an unlistable subtree without a word otherwise.
        _warn(f"cannot list {error.filename}: {error.strerror}")

    for dirpath, dirnames, filenames in os.walk(root, onerror=on_walk_error):
        # Rebinding dirnames leaves os.walk pruning nothing.
        dirnames[:] = [d for d in dirnames if d not in PRUNE]
        for name in filenames:
            if not name.endswith(EXTS):
                continue
            path = Path(dirpath) / name
            # A symlink can point outside the tree, and a pipe or socket blocks the read forever.
            if path.is_symlink() or not path.is_file():
                _warn(f"skipped non-regular entry {path}")
                continue
            # The output is one record per line, so a name carrying a newline cannot be listed.
            if "\n" in name or "\r" in name:
                _warn(f"skipped file whose name carries a line break under {dirpath}")
                continue
            yield path


def count_lines(path: Path) -> int | None:
    try:
        with path.open("rb") as fh:
            return sum(1 for _ in fh)
    except OSError as error:
        # One unreadable file must not stop the listing.
        _warn(f"cannot read {path}: {error.strerror}")
        return None


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: list-source-files.py <repo-root | source-file>", file=sys.stderr)
        return EXIT_USAGE
    target = sys.argv[1]
    if os.path.isfile(target):
        paths: Iterator[Path] = iter([Path(target)])
    elif os.path.isdir(target):
        paths = source_files(target)
    else:
        # os.walk yields nothing for a missing path, which would read as an empty tree.
        print(f"error: neither a directory nor a file: {target}", file=sys.stderr)
        return EXIT_USAGE
    results: list[tuple[int, str]] = []
    for path in paths:
        lines = count_lines(path)
        if lines is not None:
            results.append((lines, str(path)))
    for lines, path in sorted(results, key=lambda r: (-r[0], r[1])):
        print(f"{lines} {path}")
    if len(results) > SOURCE_CAP:
        print(f"over cap: {len(results)} files exceed SOURCE_CAP={SOURCE_CAP}", file=sys.stderr)
        return EXIT_OVER_CAP
    return 0


if __name__ == "__main__":
    sys.exit(main())
