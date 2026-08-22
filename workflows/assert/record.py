"""Usage: record.py   (assert run payload JSON on stdin)

Append one assert run to $HOME/.claude/history/assert-runs.jsonl.

stdin:  JSON {gate, gate_reason, build, tests, mode, issue_counts, dropped_findings}
        Every key is copied to the row verbatim. assert is 1 run 1 line (unlike
        build, no run_id joins rows), so the row carries no defaults beyond what
        the payload supplies.
stdout: one line of JSON, {path}.
exit 0 on success. exit 1 on an unparseable payload (nothing written).

Resolved fields, added to the row:
  generated_at  UTC ISO-8601
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn, cast

HISTORY_DIR = Path.home() / ".claude" / "history"
# One fixed file, not audit's file per run: counting then reads a single jsonl.
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
