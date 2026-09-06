#!/usr/bin/env python3
"""Usage:
  worktree.py <session-id>             Create a fresh assert worktree
  worktree.py --cleanup <session-id>   Remove the assert worktree and its branch

The branch and path are derived from the session id so creation and cleanup
never drift: branch = assert-<id>, path = .claude/worktrees/assert-<id>. git runs
from the process cwd (the repo root), so the path is relative to it.

Create removes any stale worktree and branch first, then adds a fresh one from
HEAD.

stdout (create):  JSON {branch, path, status: "created"}
stdout (cleanup): JSON {branch, path, status: "removed"}
On create failure: JSON {branch, path, status: "error", reason, stderr}, exit 1
(the caller sets worktree_ok: false from this, which workflows/assert.js's
envFail reads as an env failure). Cleanup is best-effort: stale-state removals
are ignored and it never fails the run.
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
    """Errors are ignored: failing to clear stale state must not fail the run."""
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
