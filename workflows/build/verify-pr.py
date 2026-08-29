#!/usr/bin/env python3
"""Usage: verify-pr.py   (PR verification payload JSON on stdin)

Verify against GitHub that the draft pull request the Ship stage reported actually
exists with the declared head and base, instead of trusting the agent's `pr_url`
field. build.js returns whatever url the Ship agent hands back; a url string is not
evidence that a PR was created, that it is a draft, or that it targets the branch
the build cut.

stdin: JSON {branch, base_branch, repository, cwd}
  One of repository or cwd is required, so gh knows which repository to ask.
  repository   "owner/name" of the GitHub repository; omit to let cwd select it
  branch       the head branch the build pushed
  base_branch  the base branch the PR must target
  cwd          optional absolute directory to run gh from

stdout: JSON {verdict, classification, reason_codes, failure_route, blockers, ...}
  verdict pass only when gh returns a PR for the branch and every field below
  matches: isDraft is true, baseRefName is base_branch, headRefName is branch, and
  url is a non-empty string.
exit 0 on a completed run (read the verdict from JSON). exit 1 on usage / parse
error -- fail-closed: a malformed payload is never reported as a verified PR. A gh
failure is a fail verdict, not an exit-1: the run completed and the answer is "no".
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

PROTOCOL = "claude-build-ship/v1"
FIELDS = "url,isDraft,baseRefName,headRefName"


def fail(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def required_string(payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        fail(f"{key} must be a non-empty string")
    return value.strip()


def view_pr(repository: str, branch: str, cwd: str | None) -> tuple[int, dict[str, object], str]:
    scope = ["--repo", repository] if repository else []
    completed = subprocess.run(
        ["gh", "pr", "view", branch, *scope, "--json", FIELDS],
        capture_output=True,
        text=True,
        check=False,
        cwd=cwd,
    )
    try:
        parsed = json.loads(completed.stdout or "{}")
    except json.JSONDecodeError:
        parsed = {}
    return completed.returncode, parsed if isinstance(parsed, dict) else {}, completed.stderr.strip()


def verify(payload: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        fail("payload must be a JSON object")
    repository = payload.get("repository")
    if repository is not None and (not isinstance(repository, str) or not repository.strip()):
        fail("repository must be a non-empty string when present")
    repository = repository.strip() if isinstance(repository, str) else ""
    branch = required_string(payload, "branch")
    base_branch = required_string(payload, "base_branch")
    cwd = payload.get("cwd")
    if cwd is not None:
        if not isinstance(cwd, str) or not Path(cwd).is_absolute():
            fail("cwd must be an absolute path when present")
    if not repository and not isinstance(cwd, str):
        fail("either repository or cwd is required, so gh knows which repository to ask")

    code, view, stderr = view_pr(repository, branch, cwd if isinstance(cwd, str) else None)
    blockers: list[str] = []
    if code != 0:
        blockers.append(f"gh pr view exited {code}: {stderr or 'no stderr'}")
    else:
        if view.get("isDraft") is not True:
            blockers.append(f"pull request is not a draft (isDraft={view.get('isDraft')!r})")
        if view.get("baseRefName") != base_branch:
            blockers.append(
                f"base branch is {view.get('baseRefName')!r}, not the declared {base_branch!r}"
            )
        if view.get("headRefName") != branch:
            blockers.append(
                f"head branch is {view.get('headRefName')!r}, not the declared {branch!r}"
            )
        url = view.get("url")
        if not isinstance(url, str) or not url.strip():
            blockers.append("pull request carries no url")

    return {
        "protocol": PROTOCOL,
        "verdict": "fail" if blockers else "pass",
        "classification": "ship_verification_failed" if blockers else "pass",
        "reason_codes": ["ship_verification_failed"] if blockers else [],
        "failure_route": "blocked" if blockers else None,
        "blockers": blockers,
        "url": view.get("url") if not blockers else None,
        "is_draft": view.get("isDraft"),
        "base_ref_name": view.get("baseRefName"),
        "head_ref_name": view.get("headRefName"),
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        fail(f"stdin is not valid JSON: {error}")
    print(json.dumps(verify(payload), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
