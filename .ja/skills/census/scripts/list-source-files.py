"""ツリー内のソースファイルを行数降順で一覧する。同じ行数はパス昇順。

Usage: list-source-files.py <repo-root | source-file>
Output: 1 行 1 ファイルで "<行数> <パス>"。ファイルを渡すとそのファイル 1 件を出す。
Exit: 0。件数が SOURCE_CAP を超えたら 3 (一覧は出し切り、stderr にその旨を書く)。
      引数が無いか、ディレクトリでもファイルでもなければ 2。
列挙も読み取りもできない項目は、名前を stderr に 1 行書いて飛ばす。一覧が黙って
ツリーを少なく数えることはない。
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
EXIT_USAGE = 2


def _warn(message: str) -> None:
    print(f"warning: {message}", file=sys.stderr)


def source_files(root: str) -> Iterator[Path]:
    def on_walk_error(error: OSError) -> None:
        # 何も言わなければ os.walk は列挙できない部分木を丸ごと落とす。
        _warn(f"cannot list {error.filename}: {error.strerror}")

    for dirpath, dirnames, filenames in os.walk(root, onerror=on_walk_error):
        # dirnames への再代入では os.walk が枝刈りを見ない。
        dirnames[:] = [d for d in dirnames if d not in PRUNE]
        for name in filenames:
            if not name.endswith(EXTS):
                continue
            path = Path(dirpath) / name
            # シンボリックリンクはツリーの外を指し得るし、パイプやソケットは読み取りが永遠に止まる。
            if path.is_symlink() or not path.is_file():
                _warn(f"skipped non-regular entry {path}")
                continue
            # 出力は 1 行 1 レコードなので、改行を含む名前は一覧に出せない。
            if "\n" in name or "\r" in name:
                _warn(f"skipped file whose name carries a line break under {dirpath}")
                continue
            yield path


def count_lines(path: Path) -> int | None:
    try:
        with path.open("rb") as fh:
            return sum(1 for _ in fh)
    except OSError as error:
        # 読めない 1 ファイルで列挙を止めない。
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
        # 存在しないパスでも os.walk は何も返さず、空のツリーと区別が付かない。
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
