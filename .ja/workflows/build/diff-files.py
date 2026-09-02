#!/usr/bin/env python3
"""Usage: diff-files.py   (diff 列挙の payload JSON を stdin から)

build が分岐点以降に変えたファイルを、agent の手順再現ではなく git に照会して列挙する。
build.js の Verify はこの一覧を scope 逸脱と未変更 plan files の両方の材料にするが、
agent に `git diff <sha>` を実行させると、比較対象を自分で引いた HEAD に置き換えて実行する
ことがある。unit コミット後の HEAD 基準では、コミット済みの実装ファイルが一覧から消え、
plan files が「一度も変更されていない」と PR に書かれる。

stdin: JSON {repo, base}
  repo   リポジトリの絶対パス
  base   比較対象のコミット (分岐点 sha、または unit コミットが無効なときの HEAD)

stdout: JSON {files, base, error}
  files  `git diff <base> --name-only` と `git ls-files --others --exclude-standard` の
         和集合。リポジトリルート起点、重複なし、辞書順。git が失敗したときは null で、
         error にその stderr を載せる。build.js は null を「一覧未取得」と読む
exit 0 は実行完了 (結果は JSON から読む)。exit 1 は usage / parse エラー。fail-closed:
不正な payload を空の変更一覧として報告することはない。
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

PROTOCOL = "claude-build-diff/v1"


class GitFailed(Exception):
    """git が非ゼロで終了した。message はその stderr。"""


def fail(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def git_paths(repo: str, args: list[str]) -> list[str]:
    """-z 区切りの stdout をパスの一覧にする。-z は名前に空白や非 ASCII を含むパスの引用符を外す。"""
    completed = subprocess.run(
        ["git", "-C", repo, *args, "-z"], capture_output=True, text=True, check=False
    )
    if completed.returncode != 0:
        raise GitFailed(completed.stderr.strip() or f"git {args[0]} exited {completed.returncode}")
    return [path for path in completed.stdout.split("\0") if path]


def required_string(payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        fail(f"{key} must be a non-empty string")
    return value.strip()


def list_files(payload: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        fail("payload must be a JSON object")
    repo = required_string(payload, "repo")
    if not Path(repo).is_absolute():
        fail("repo must be an absolute path")
    base = required_string(payload, "base")

    # base と作業ツリーの差分はコミット済みも未コミットも 1 つの diff に入る。未追跡ファイルは
    # diff に現れないので ls-files で足す。--exclude-standard は status と同じ ignore 規則。
    try:
        changed = git_paths(repo, ["diff", base, "--name-only"])
        untracked = git_paths(repo, ["ls-files", "--others", "--exclude-standard"])
    except GitFailed as error:
        return {"protocol": PROTOCOL, "files": None, "base": base, "error": str(error)}
    return {
        "protocol": PROTOCOL,
        "files": sorted(set(changed) | set(untracked)),
        "base": base,
        "error": "",
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        fail(f"stdin is not valid JSON: {error}")
    print(json.dumps(list_files(payload), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
