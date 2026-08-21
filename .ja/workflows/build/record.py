"""Usage: record.py   (build の run payload JSON を stdin で受ける)

build の 1 実行を $HOME/.claude/history/build-runs.jsonl へ 1 行追記する。

stdin:  JSON {issue, repo, branch, reason, plan_quality, run_id?, nested_reason?}
        キーは row にそのまま写す。"?" の無い 5 つは、無ければ空の既定値で埋めるので、
        どの row も同じキー集合で読める。
stdout: {path, run_id} の JSON 1 行。呼び出し元は同じ build の次の row へ run_id を
        渡し直す。停止の row が開始の row と結び付くのはこの経路だけ。
exit 0 は成功。exit 1 は payload が parse 不能 (何も書かない)。

row に追加される解決済みフィールド:
  run_id        uuid4 の hex。payload が run_id を持たないときだけ発行する。build は
                同じ秒のうちに開始して停止しうるので、timestamp では両者を分けられない。
  generated_at  UTC ISO-8601
"""

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn, cast

HISTORY_DIR = Path.home() / ".claude" / "history"
# ファイル名は固定。1 実行 1 行の追記なので、集計は jsonl を 1 本読むだけで済む。
RUNS_PATH = HISTORY_DIR / "build-runs.jsonl"

# 呼び出し元が載せる既定値付きのフィールド。開始の row は branch をまだ持たないが、
# キーを落とすと読み手が row の種類ごとに分岐することになるので、空文字で埋める。
DEFAULTS: dict[str, object] = {
    "issue": "",
    "repo": "",
    "branch": "",
    "reason": "",
    "plan_quality": False,
}


def fail(message: str) -> NoReturn:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def build_row(payload: dict[str, object], run_id: str, generated_at: str) -> dict[str, object]:
    row: dict[str, object] = {"run_id": run_id}
    for key, default in DEFAULTS.items():
        row[key] = payload.get(key, default)
    for key, value in payload.items():
        if key not in row:
            row[key] = value
    row["generated_at"] = generated_at
    return row


def main() -> None:
    raw_stdin = sys.stdin.read()
    try:
        loaded = cast("object", json.loads(raw_stdin))
    except ValueError as exc:
        fail(f"unparseable payload: {exc}")
    if not isinstance(loaded, dict):
        fail("payload must be a JSON object")
    payload = cast("dict[str, object]", loaded)

    supplied = payload.pop("run_id", "")
    run_id = str(supplied) if supplied else uuid.uuid4().hex

    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    row = build_row(payload, run_id=run_id, generated_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"))

    with RUNS_PATH.open("a") as fh:
        _ = fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps({"path": str(RUNS_PATH), "run_id": run_id}))


if __name__ == "__main__":
    main()
