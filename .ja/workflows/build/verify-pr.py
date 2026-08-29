#!/usr/bin/env python3
"""Usage: verify-pr.py   (PR 検証の payload JSON を stdin から)

Ship stage が報告した draft pull request が、宣言どおりの head と base で実在するかを
agent の `pr_url` フィールドではなく GitHub に照会して検証する。build.js は Ship agent
が返した url をそのまま返すが、url 文字列は PR が作られた証拠でも、draft である証拠でも、
build が切ったブランチを対象にしている証拠でもない。

stdin: JSON {branch, base_branch, repository, cwd}
  repository と cwd のどちらかは必須である。gh にどのリポジトリを問うかを決めるため。
  repository   GitHub リポジトリの "owner/name"。省略すると cwd が対象を決める
  branch       build が push した head ブランチ
  base_branch  PR が対象とすべき base ブランチ
  cwd          gh を実行するディレクトリの絶対パス (任意)

stdout: JSON {verdict, classification, reason_codes, failure_route, blockers, ...}
  verdict が pass になるのは、gh がそのブランチの PR を返し、次のすべてが一致する
  ときだけである。isDraft が true、baseRefName が base_branch、headRefName が branch、
  url が空でない文字列。
exit 0 は実行完了 (判定は JSON から読む)。exit 1 は usage / parse エラー。fail-closed:
不正な payload を検証済み PR として報告することはない。gh の失敗は exit 1 ではなく fail
判定である。実行は完了しており、答えが「ない」だからである。
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
    view = parsed if isinstance(parsed, dict) else {}
    return completed.returncode, view, completed.stderr.strip()


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
    if cwd is not None and (not isinstance(cwd, str) or not Path(cwd).is_absolute()):
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
