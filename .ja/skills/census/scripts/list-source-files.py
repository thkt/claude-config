"""ツリー内のソースファイルを行数降順で一覧する。

Usage: list-source-files.py <repo-root>
Output: 1 行 1 ファイルで "<行数> <パス>"。
"""
import os
import sys
from pathlib import Path

EXTS = (".rs", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".swift")
PRUNE = {"target", "node_modules", ".git"}


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: list-source-files.py <repo-root>", file=sys.stderr)
        return 2
    root = sys.argv[1]
    results: list[tuple[int, str]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # dirnames への再代入では os.walk が枝刈りを見ない。
        dirnames[:] = [d for d in dirnames if d not in PRUNE]
        for name in filenames:
            if not name.endswith(EXTS):
                continue
            path = Path(dirpath) / name
            try:
                with path.open("rb") as fh:
                    lines = sum(1 for _ in fh)
            except OSError:
                # 読めない 1 ファイル (権限、シンボリックリンク切れ) で列挙を止めない。
                continue
            results.append((lines, str(path)))
    for lines, path in sorted(results, reverse=True):
        print(f"{lines} {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
