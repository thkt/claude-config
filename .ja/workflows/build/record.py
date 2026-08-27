"""Usage: record.py   (build の run payload JSON を stdin で受ける)

build の 1 実行を $HOME/.claude/history/build-runs.jsonl へ 1 行追記する。

stdin:  JSON {issue, repo, branch, reason, plan_quality, run_id?, nested_reason?}
        キーは row にそのまま写す。"?" の無い 5 つは、無ければ空の既定値で埋めるので、
        どの row も同じキー集合で読める。
stdout: {path, run_id, started, stops, trigger_met, skipped_lines} の JSON 1 行。
        呼び出し元が同じ build の次の row へ run_id を渡し直し、停止の row は開始の
        row と結び付く。started/stops/trigger_met/skipped_lines は追記後に RUNS_PATH
        を読み直して数える。読み直せない履歴 (権限、実行中の競合) ではこの 4 つを
        落とすが、path と run_id は常に出す。
exit 0 は成功。exit 1 は payload が parse 不能 (何も書かない)。

row に追加される解決済みフィールド:
  run_id        uuid4 の hex。payload が run_id を持たないときだけ発行する。build は
                同じ秒のうちに開始して停止しうるので、timestamp では両者を分けられない。
  generated_at  UTC ISO-8601

窓の集計。stdout のみに載り row には書かない:
  started       直近の WINDOW_SIZE 件に絞った reason=="started" row の数。この実行が
                自分の行を追記した後の RUNS_PATH を読み直して数える。
  stops         plan_quality==true の停止 row (reason != "started") のうち、run_id が
                その started row の集合に入っているものの数。つまり今の窓の中の停止。
  trigger_met   stops >= STOP_TRIGGER。
  skipped_lines RUNS_PATH の行のうち JSON object として parse できなかった行数。
"""

import json
import sys
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn, cast

HISTORY_DIR = Path.home() / ".claude" / "history"
# audit のような run ごとのファイルでなく 1 本に固定する。集計が jsonl を 1 本読むだけで済む。
RUNS_PATH = HISTORY_DIR / "build-runs.jsonl"

# plan-quality の停止は履歴全体でなく直近の build の連なりに固まって出る。よって集計は
# ファイル全体でなく直近の started row の窓に絞る。
WINDOW_SIZE = 20
STOP_TRIGGER = 3

# 開始の row は branch をまだ持たない。キーを落とすと読み手が row の種類ごとに分岐する
# ことになるので、既定値で埋める。
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


def count_plan_quality_stops(path: Path) -> dict[str, object] | None:
    """`path` (RUNS_PATH が直前に追記した同じ Path) を読み直し、直近の started row の
    窓の中にある plan-quality の停止を数える。読み直しすらできないとき (権限、実行中に
    消えた等) は None を返す。呼び出し元はこれらのキーを stdout から落とすだけで、
    参考情報でしかない集計のために本体の実行を失敗させない。"""
    try:
        lines = path.read_text().splitlines()
    except OSError:
        return None

    rows: list[dict[str, object]] = []
    skipped_lines = 0
    for line in lines:
        if not line.strip():
            continue
        try:
            parsed = cast("object", json.loads(line))
        except ValueError:
            skipped_lines += 1
            continue
        if not isinstance(parsed, dict):
            skipped_lines += 1
            continue
        rows.append(cast("dict[str, object]", parsed))

    # run_id は自分の started row を見た時点で一度だけ窓に入るので、同じ run_id の
    # 後続の停止は、その started row が WINDOW_SIZE 件より新しい run に押し出されて
    # 初めて窓の外になる。
    started_ids: deque[object] = deque(maxlen=WINDOW_SIZE)
    for row in rows:
        if row.get("reason") == "started":
            started_ids.append(row.get("run_id"))
    window_ids = set(started_ids)

    stops = 0
    for row in rows:
        if (
            row.get("reason") != "started"
            and row.get("plan_quality") is True
            and row.get("run_id") in window_ids
        ):
            stops += 1

    return {
        "started": len(started_ids),
        "stops": stops,
        "trigger_met": stops >= STOP_TRIGGER,
        "skipped_lines": skipped_lines,
    }


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
    row = {
        "run_id": run_id,
        **DEFAULTS,
        **payload,
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    with RUNS_PATH.open("a") as fh:
        _ = fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    output: dict[str, object] = {"path": str(RUNS_PATH), "run_id": run_id}
    try:
        counts = count_plan_quality_stops(RUNS_PATH)
    # 広く捕まえる。この失敗でも path/run_id は stdout へ届かせる。
    except Exception:
        counts = None
    if counts is not None:
        output.update(counts)
    print(json.dumps(output))


if __name__ == "__main__":
    main()
