"""ツリー内のソースファイルを行数降順で一覧する。

Usage: list-source-files.py <repo-root>
Output: 1 行 1 ファイルで "<行数> <パス>" を降順出力。
"""
import os
import sys

EXTS = (".rs", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".swift")
PRUNE = {"target", "node_modules", ".git"}


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: list-source-files.py <repo-root>", file=sys.stderr)
        return 2
    root = sys.argv[1]
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in PRUNE]
        for name in filenames:
            if not name.endswith(EXTS):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, "rb") as fh:
                    lines = sum(1 for _ in fh)
            except OSError:
                continue
            results.append((lines, path))
    for lines, path in sorted(results, reverse=True):
        print(f"{lines} {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
