#!/usr/bin/env python3
"""Usage:
  worktree.py <session-id>             assert worktree を新規作成する
  worktree.py --cleanup <session-id>   assert worktree とその branch を削除する

branch と path は session id から導出するため、作成と cleanup が drift しない。
branch = assert-<id>、path = .claude/worktrees/assert-<id>。git はプロセスの cwd
(repo root) から実行するため、path はそこからの相対。

作成はまず古い worktree と branch を除去し、続けて HEAD から新規に add する。

stdout (create):  JSON {branch, path, status: "created"}
stdout (cleanup): JSON {branch, path, status: "removed"}
作成失敗時: JSON {branch, path, status: "error", reason, stderr}、exit 1
(env failure、assert.js の envFail 規則)。cleanup は
best-effort で、古い状態の除去失敗は無視し run を失敗させない。
"""

import json
import subprocess
import sys
from collections.abc import Callable, Sequence

Runner = Callable[[Sequence[str]], tuple[int, str]]


def _real_runner(cmd: Sequence[str]) -> tuple[int, str]:
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    return proc.returncode, proc.stderr


def paths(session_id: str) -> tuple[str, str]:
    branch = f"assert-{session_id}"
    path = f".claude/worktrees/assert-{session_id}"
    return branch, path


def _remove(branch: str, path: str, runner: Runner) -> None:
    """エラーは無視する。古い状態の除去に失敗しても run は失敗させない。"""
    _ = runner(["git", "worktree", "remove", path, "--force"])
    _ = runner(["git", "branch", "-D", branch])


def create(session_id: str, runner: Runner = _real_runner) -> dict[str, str]:
    branch, path = paths(session_id)
    _remove(branch, path, runner)
    rc, stderr = runner(["git", "worktree", "add", "-b", branch, path, "HEAD"])
    if rc != 0:
        return {
            "branch": branch,
            "path": path,
            "status": "error",
            "reason": f"env:worktree-add-exit-{rc}",
            "stderr": stderr.strip(),
        }
    return {"branch": branch, "path": path, "status": "created"}


def cleanup(session_id: str, runner: Runner = _real_runner) -> dict[str, str]:
    branch, path = paths(session_id)
    _remove(branch, path, runner)
    return {"branch": branch, "path": path, "status": "removed"}


def main() -> None:
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "--cleanup":
        print(json.dumps(cleanup(args[1])))
        return
    if len(args) == 1 and not args[0].startswith("-"):
        result = create(args[0])
        print(json.dumps(result))
        if result["status"] == "error":
            sys.exit(1)
        return
    print(
        "Usage: worktree.py <session-id> | worktree.py --cleanup <session-id>",
        file=sys.stderr,
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
