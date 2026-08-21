"""Usage: record.py   (build run payload JSON on stdin)

Append one build run to $HOME/.claude/history/build-runs.jsonl.

stdin:  JSON {issue, repo, branch, reason, plan_quality, run_id?, nested_reason?}
        Every key is copied to the row verbatim. The five without a "?" are filled with
        an empty default when absent, so every row reads with the same key set.
stdout: one line of JSON, {path, run_id}. The caller passes run_id back on the next row
        of the same build, which is how a stop row joins its start row.
exit 0 on success. exit 1 on an unparseable payload (nothing written).

Resolved fields, added to the row:
  run_id        uuid4 hex, minted only when the payload carries none. A build can start
                and stop within the same second, so a timestamp cannot separate the two.
  generated_at  UTC ISO-8601
"""

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn, cast

HISTORY_DIR = Path.home() / ".claude" / "history"
# One fixed file, not audit's file per run: counting then reads a single jsonl.
RUNS_PATH = HISTORY_DIR / "build-runs.jsonl"

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
    print(json.dumps({"path": str(RUNS_PATH), "run_id": run_id}))


if __name__ == "__main__":
    main()
