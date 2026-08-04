"""Usage: snapshot.py   (audit payload JSON on stdin)

audit の 1 実行を $HOME/.claude/history/ に記録する。

stdin:  JSON {scope, focus, pre_flight, raw_findings[], findings[], skipped[],
        challenge_ran, verify_ran, tally, needs_context[], zero_reviewer_files[]}
        各 raw_findings entry は最低限 {file, message} を持ち、triage を通った後は
        {id, reviewer, verdict} も持つ。
        キーは record にそのまま写す。無いキーは無いまま。tally が無い run は
        fail-open したことを意味し、それは challenge_ran / verify_ran が直接示す。
stdout: {path, counts} の JSON 1 行。counts はこのプロセスが serialize した各配列の
        要素数なので、呼び出し元は payload を書き写した agent 由来でない数字と
        照合できる。
exit 0 は成功。exit 1 は payload が parse 不能 (何も書かない)。

record に追加される解決済みフィールド (シェル由来):
  branch        git rev-parse --abbrev-ref HEAD ("unknown" にフォールバック)
  generated_at  UTC ISO-8601
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn

HISTORY_DIR = Path(os.path.expanduser("~")) / ".claude" / "history"


def fail(message) -> NoReturn:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def git_branch():
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        branch = out.stdout.strip()
        return branch or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


COUNTED_ARRAYS = (
    "raw_findings",
    "findings",
    "skipped",
    "needs_context",
    "zero_reviewer_files",
)


def counted_arrays(record):
    """record が持つ配列ごとの要素数。呼び出し元はこれと照合する。

    無いキーは省かず 0 と数える。呼び出し元が毎回同じキー集合を読めるので、
    配列が丸ごと落ちた場合もフィールドの欠落でなく件数の不一致として出る。
    """
    return {
        key: len(record[key]) if isinstance(record.get(key), list) else 0
        for key in COUNTED_ARRAYS
    }


def build_record(payload, branch, generated_at):
    record = dict(payload)
    record["branch"] = branch
    record["generated_at"] = generated_at
    return record


def main():
    raw_stdin = sys.stdin.read()
    try:
        payload = json.loads(raw_stdin)
    except ValueError as exc:
        fail(f"unparseable payload: {exc}")
    if not isinstance(payload, dict):
        fail("payload must be a JSON object")

    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)

    record = build_record(
        payload,
        branch=git_branch(),
        generated_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )

    out_path = HISTORY_DIR / f"audit-{now.strftime('%Y-%m-%d-%H%M%S')}.json"
    with open(out_path, "w") as fh:
        json.dump(record, fh, ensure_ascii=False, indent=2)
    # counts はこのプロセスが serialize した内容から取る。呼び出し元は agent が
    # 自分について報告した数字ではなく、この値と照合する。
    print(json.dumps({"path": str(out_path), "counts": counted_arrays(record)}))


if __name__ == "__main__":
    main()
