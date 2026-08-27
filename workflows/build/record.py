"""Usage: record.py   (build run payload JSON on stdin)

Append one build run to $HOME/.claude/history/build-runs.jsonl.

stdin:  JSON {issue, repo, branch, reason, plan_quality, run_id?, nested_reason?}
        Every key is copied to the row verbatim. The five without a "?" are filled with
        an empty default when absent, so every row reads with the same key set.
stdout: one line of JSON, {path, run_id, started, stops, trigger_met, skipped_lines}.
        The caller passes run_id back on the next row of the same build, which is how a
        stop row joins its start row. started/stops/trigger_met/skipped_lines are counted
        by re-reading RUNS_PATH after the append; a history the process cannot read back
        (permissions, a race) drops those four keys but path and run_id are always printed.
exit 0 on success. exit 1 on an unparseable payload (nothing written).

Resolved fields, added to the row:
  run_id        uuid4 hex, minted only when the payload carries none. A build can start
                and stop within the same second, so a timestamp cannot separate the two.
  generated_at  UTC ISO-8601

Window count, added to stdout only (not written to the row):
  started       count of reason=="started" rows in the last WINDOW_SIZE such rows, read
                back from RUNS_PATH after this run's own append.
  stops         count of plan_quality==true stop rows (reason != "started") whose run_id
                is one of those started rows, i.e. a stop inside the current window.
  trigger_met   stops >= STOP_TRIGGER.
  skipped_lines count of lines in RUNS_PATH that do not parse as a JSON object.
"""

import json
import sys
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn, cast

HISTORY_DIR = Path.home() / ".claude" / "history"
# One fixed file, not audit's file per run: counting then reads a single jsonl.
RUNS_PATH = HISTORY_DIR / "build-runs.jsonl"

# Plan-quality stops cluster in a run of recent builds rather than over all history, so the
# count is scoped to a trailing window of started runs instead of the whole file.
WINDOW_SIZE = 20
STOP_TRIGGER = 3

# A start row does not know its branch yet. Dropping the key would make the reader branch on
# the kind of row, so the defaults fill it instead.
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
    """Re-read `path` (the same Path RUNS_PATH just appended to) and count plan-quality
    stops inside the trailing window of started runs. Returns None when the file cannot
    even be read back (permissions, removed mid-run); the caller then omits these keys
    from stdout rather than failing the run over a count that is advisory only."""
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

    # A run_id enters the window once, when its started row is seen, so a later stop for
    # the same run_id can still land inside a window whose started row aged it out only
    # once WINDOW_SIZE more recent runs started after it.
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
    # A broad catch: path/run_id must reach stdout even on a surprise here.
    except Exception:
        counts = None
    if counts is not None:
        output.update(counts)
    print(json.dumps(output))


if __name__ == "__main__":
    main()
