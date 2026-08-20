"""Usage: snapshot.py   (audit payload JSON on stdin)

Record one audit run to $HOME/.claude/history/.

stdin:  JSON {scope, focus, pre_flight, raw_findings[], findings[], skipped[],
        challenge_ran, verify_ran, tally, needs_context[], zero_reviewer_files[]}
        each raw_findings entry carries at least {file, message}, plus {id, reviewer,
        verdict} once the triage pass has run.
        Every key is copied to the record verbatim; absent keys stay absent. An absent
        tally means the run failed open, which challenge_ran / verify_ran state directly.
stdout: one line of JSON, {path, counts}. counts holds the element count of each
        array this process serialized, so the caller compares against a figure it
        did not obtain from the agent that transcribed the payload.
exit 0 on success. exit 1 on an unparseable payload (nothing written).

Resolved fields (shell), added to the record:
  branch        git rev-parse --abbrev-ref HEAD (falls back to "unknown")
  generated_at  UTC ISO-8601
"""

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn, cast

HISTORY_DIR = Path.home() / ".claude" / "history"


def fail(message: str) -> NoReturn:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def git_branch() -> str:
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


def counted_arrays(record: dict[str, object]) -> dict[str, int]:
    """An absent key counts 0 rather than being omitted, so the caller reads the
    same key set every run and a dropped array is a count mismatch instead of a
    missing field."""
    counts: dict[str, int] = {}
    for key in COUNTED_ARRAYS:
        value = record.get(key)
        counts[key] = len(cast("list[object]", value)) if isinstance(value, list) else 0
    return counts


def build_record(payload: dict[str, object], branch: str, generated_at: str) -> dict[str, object]:
    record = dict(payload)
    record["branch"] = branch
    record["generated_at"] = generated_at
    return record


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

    record = build_record(
        payload,
        branch=git_branch(),
        generated_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )

    out_path = HISTORY_DIR / f"audit-{now.strftime('%Y-%m-%d-%H%M%S')}.json"
    with out_path.open("w") as fh:
        json.dump(record, fh, ensure_ascii=False, indent=2)
    print(json.dumps({"path": str(out_path), "counts": counted_arrays(record)}))


if __name__ == "__main__":
    main()
