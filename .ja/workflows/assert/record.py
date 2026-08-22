"""Usage: record.py   (assert の run payload JSON を stdin で受ける)

assert の 1 実行を $HOME/.claude/history/assert-runs.jsonl へ 1 行追記する。

stdin:  JSON {gate, gate_reason, build, tests, mode, issue_counts, dropped_findings}
        キーは row にそのまま写す。assert は 1 run 1 行 (build と違い run_id で row を
        結び付ける必要が無い) なので、row は payload が渡したもの以外の既定値を持たない。
stdout: {path} の JSON 1 行。
exit 0 は成功。exit 1 は payload が parse 不能 (何も書かない)。

row に追加される解決済みフィールド:
  generated_at  UTC ISO-8601
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn, cast

HISTORY_DIR = Path.home() / ".claude" / "history"
# audit のような run ごとのファイルでなく 1 本に固定する。集計が jsonl を 1 本読むだけで済む。
RUNS_PATH = HISTORY_DIR / "assert-runs.jsonl"


def fail(message: str) -> NoReturn:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    raw_stdin = sys.stdin.read()
    try:
        loaded = cast("object", json.loads(raw_stdin))
    except ValueError as exc:
        fail(f"unparseable payload: {exc}")
    if not isinstance(loaded, dict):
        fail("payload must be a JSON object")
    payload = cast("dict[str, object]", loaded)

    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    row = {
        **payload,
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    with RUNS_PATH.open("a") as fh:
        _ = fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps({"path": str(RUNS_PATH)}))


if __name__ == "__main__":
    main()
