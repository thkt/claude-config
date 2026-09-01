"""ツリー内のソースファイルを行数降順で一覧する。同じ行数はパス昇順。

Usage: list-source-files.py <repo-root>
Output: 1 行 1 ファイルで "<行数> <パス>"。
Exit: 0。件数が SOURCE_CAP を超えたら 3 (一覧は出し切り、stderr にその旨を書く)。
      引数が無いか、ディレクトリを指していなければ 2。
"""

import os
import sys
from collections.abc import Iterator
from pathlib import Path

EXTS = (".rs", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".swift")
# .ja は翻訳ミラーで、英語側と合わせて 1 要素と数える (rules/conventions/MIRROR.md)。
PRUNE = {"target", "node_modules", ".git", "dist", "build", ".venv", "__pycache__", ".ja"}

# この件数を超えたら、Phase 1 は reviewer を並列起動する前にユーザーへ絞り込みを求める。
SOURCE_CAP = 20
EXIT_OVER_CAP = 3


def source_files(root: str) -> Iterator[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        # dirnames への再代入では os.walk が枝刈りを見ない。
        dirnames[:] = [d for d in dirnames if d not in PRUNE]
        for name in filenames:
            if name.endswith(EXTS):
                yield Path(dirpath) / name


def count_lines(path: Path) -> int | None:
    try:
        with path.open("rb") as fh:
            return sum(1 for _ in fh)
    except OSError:
        # 読めない 1 ファイル (権限、シンボリックリンク切れ) で列挙を止めない。
        return None


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: list-source-files.py <repo-root>", file=sys.stderr)
        return 2
    root = sys.argv[1]
    # 存在しないパスでも os.walk は何も返さず、空のツリーと区別が付かない。
    if not os.path.isdir(root):
        print(f"error: not a directory: {root}", file=sys.stderr)
        return 2
    results: list[tuple[int, str]] = []
    for path in source_files(root):
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
