#!/usr/bin/env python3
"""Usage: diff-files.py   (diff listing payload JSON on stdin)

Lists the files the build changed since the branch point by asking git, not by having an
agent replay the steps. build.js's Verify feeds this list into both the scope deviations and
the untouched plan files, but an agent told to run `git diff <sha>` sometimes swaps the
baseline for a HEAD it resolved itself. Measured from HEAD after the unit commits, the
committed implementation files drop out of the list and the PR says the plan files were
never changed.

stdin: JSON {repo, base}
  repo   absolute path of the repository
  base   the commit to measure from (the branch-point sha, or HEAD when unit commits are off)

stdout: JSON {files, base, error}
  files  the union of `git diff <base> --name-only` and `git ls-files --others
         --exclude-standard`, repo-root-relative, deduplicated, sorted. null when git
         failed, with its stderr in error; build.js reads null as "the listing was not
         obtained"
exit 0 means the run completed (read the result from the JSON). exit 1 is a usage / parse
error. Fail-closed: a malformed payload is never reported as an empty change list.
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

PROTOCOL = "claude-build-diff/v1"


class GitFailed(Exception):
    """git exited non-zero. The message is its stderr."""


def fail(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def git_paths(repo: str, args: list[str]) -> list[str]:
    """Turns -z separated stdout into a path list. -z drops the quoting around paths with
    spaces or non-ASCII names."""
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

    # The diff between base and the working tree holds committed and uncommitted changes
    # alike. Untracked files never appear in a diff, so ls-files adds them; --exclude-standard
    # applies the same ignore rules as status.
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
