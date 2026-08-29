#!/usr/bin/env python3
"""Usage: verify-commit.py   (commit postcondition payload JSON on stdin)

Verify against Git that a unit commit landed as the workflow declared it, instead of
trusting the commit agent's self-report. code.js records `committed: true` and a
subject string from the agent; nothing in that report is evidence that a commit
exists, that it carries only the unit's files, or that its message kept the plan's
trailers.

stdin: JSON {repo, baseline_head, unit_files, body}
  repo           absolute path to the repository
  baseline_head  the commit sha HEAD pointed at before the unit commit
  unit_files     repo-root-relative paths the unit is allowed to commit
  body           the block that must follow the subject verbatim (goal + trailers)

stdout: JSON {verdict, classification, reason_codes, failure_route, blockers, ...}
  verdict pass only when every check below holds:
    - HEAD moved off baseline_head, so a commit exists
    - HEAD's first parent is baseline_head, so exactly one commit landed on the
      verified head rather than a chain that swept up unrelated work
    - the committed paths are non-empty and all listed in unit_files
    - the message is the subject, one blank line, then body verbatim
    - the subject keeps the Conventional Commits shape the prompt asked for
exit 0 on a completed run (read the verdict from JSON). exit 1 on usage / parse
error -- fail-closed: a malformed payload is never reported as a verified commit.
"""

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

PROTOCOL = "claude-code-commit/v1"
SUBJECT_MAX = 72
COMMIT_TYPES = ("feat", "fix", "refactor", "docs", "test", "chore", "perf", "style", "ci")
SUBJECT_SHAPE = re.compile(rf"^(?:{'|'.join(COMMIT_TYPES)})(?:\([^()]+\))?!?: \S.*$")


def fail(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def git(repo: str, args: list[str]) -> tuple[int, str]:
    completed = subprocess.run(
        ["git", "-C", repo, *args], capture_output=True, text=True, check=False
    )
    return completed.returncode, completed.stdout


def git_text(repo: str, args: list[str]) -> str | None:
    code, out = git(repo, args)
    return out.strip() if code == 0 else None


def strings(value: object, label: str) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
        fail(f"{label} must be an array of non-empty strings")
    return [str(item) for item in value]


def committed_paths(repo: str) -> list[str] | None:
    """Without --root a first commit reports no paths at all."""
    code, out = git(
        repo, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z", "HEAD"]
    )
    if code != 0:
        return None
    return sorted(path for path in out.split("\0") if path)


def subject_blockers(subject: str) -> list[str]:
    blockers: list[str] = []
    if len(subject) > SUBJECT_MAX:
        blockers.append(f"subject is {len(subject)} characters, over the {SUBJECT_MAX} limit")
    if subject.endswith("."):
        blockers.append("subject ends with a period")
    if not SUBJECT_SHAPE.match(subject):
        blockers.append("subject is not in <type>(<scope>): <description> form")
    return blockers


def verify(payload: object) -> dict[str, object]:
    if not isinstance(payload, dict):
        fail("payload must be a JSON object")
    repo = payload.get("repo")
    baseline_head = payload.get("baseline_head")
    body = payload.get("body")
    if not isinstance(repo, str) or not Path(repo).is_absolute():
        fail("repo must be an absolute path")
    if not isinstance(baseline_head, str) or not baseline_head.strip():
        fail("baseline_head must be a non-empty string")
    if not isinstance(body, str) or not body.strip():
        fail("body must be a non-empty string")
    unit_files = set(strings(payload.get("unit_files"), "unit_files"))
    if not unit_files:
        fail("unit_files must not be empty")

    blockers: list[str] = []
    head = git_text(repo, ["rev-parse", "HEAD"])
    if head is None:
        fail("repo is not a readable Git worktree")
    parent = git_text(repo, ["rev-parse", "HEAD^"])
    paths = committed_paths(repo)
    message = git_text(repo, ["show", "-s", "--format=%B", "HEAD"])
    subject = (message or "").split("\n", 1)[0]

    if head == baseline_head:
        blockers.append("HEAD did not move, so no commit was created")
    elif parent is None:
        blockers.append("HEAD has no parent, so it did not land on the verified baseline")
    elif parent != baseline_head:
        blockers.append(
            f"HEAD's parent is {parent}, not the verified baseline {baseline_head}; "
            "exactly one commit must land on it"
        )

    outside: list[str] = []
    if paths is None:
        blockers.append("the committed paths could not be read")
    elif not paths:
        blockers.append("the commit is empty")
    else:
        outside = [path for path in paths if path not in unit_files]
        if outside:
            blockers.append(f"committed paths outside the unit scope: {', '.join(outside)}")

    if message is None:
        blockers.append("the commit message could not be read")
    else:
        expected = f"{subject}\n\n{body}".strip()
        if message.strip() != expected:
            blockers.append("the commit message body does not match the declared block verbatim")
        blockers.extend(subject_blockers(subject))

    return {
        "protocol": PROTOCOL,
        "verdict": "fail" if blockers else "pass",
        "classification": "commit_postcondition_failed" if blockers else "pass",
        "reason_codes": ["commit_postcondition_failed"] if blockers else [],
        "failure_route": "blocked" if blockers else None,
        "blockers": blockers,
        "head": head,
        "parent": parent,
        "committed_files": paths or [],
        "outside_scope": outside,
        "subject": subject,
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
