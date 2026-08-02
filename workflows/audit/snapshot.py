"""Usage: snapshot.py   (audit payload JSON on stdin)

Record one audit run to $HOME/.claude/history/ and compute the
resolved/new/carried delta against the most recent prior snapshot.

stdin:  JSON {scope, focus, pre_flight, raw_findings[], findings[], skipped[],
        challenge_ran, verify_ran, tally, needs_context[], zero_reviewer_files[]}
        each raw_findings entry carries at least {file, message}, plus {id, reviewer,
        verdict} once the triage pass has run.
        Every key is copied to the record verbatim; absent keys stay absent. An absent
        tally means the run failed open, which challenge_ran / verify_ran state directly.
stdout: the path of the JSON record written.
exit 0 on success. exit 1 on an unparseable payload (nothing written).

Resolved fields (shell / prior snapshot), added to the record:
  branch        git rev-parse --abbrev-ref HEAD (falls back to "unknown")
  generated_at  UTC ISO-8601
  delta         {resolved, new, carried} counts vs the most recent prior
                audit-*.json, matched on (file, message); first run -> all 0 with
                note "first run".
"""

import glob
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


def finding_key(f):
    return (f.get("file"), f.get("message"))


def compute_delta(current_raw, prior_raw):
    """resolved = in prior only, new = in current only, carried = in both.

    prior_raw is None when no prior snapshot exists; the caller records a
    "first run" note in that case.
    """
    if prior_raw is None:
        return {"resolved": 0, "new": 0, "carried": 0, "note": "first run"}
    cur = {finding_key(f) for f in current_raw}
    prior = {finding_key(f) for f in prior_raw}
    return {
        "resolved": len(prior - cur),
        "new": len(cur - prior),
        "carried": len(cur & prior),
    }


def latest_prior_raw(history_dir):
    """raw_findings of the most recent prior audit-*.json, or None if none exists.

    Sorted by filename; the name embeds a UTC timestamp so lexical order is
    chronological. A prior file that is unreadable or lacks raw_findings is
    skipped rather than aborting the run.
    """
    priors = sorted(glob.glob(str(history_dir / "audit-*.json")), reverse=True)
    for path in priors:
        try:
            with open(path) as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            continue
        raw = data.get("raw_findings")
        if isinstance(raw, list):
            return raw
    return None


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


def build_record(payload, branch, generated_at, delta):
    record = dict(payload)
    record["branch"] = branch
    record["generated_at"] = generated_at
    record["delta"] = delta
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

    prior_raw = latest_prior_raw(HISTORY_DIR)
    current_raw = payload.get("raw_findings") or []
    delta = compute_delta(current_raw, prior_raw)

    record = build_record(
        payload,
        branch=git_branch(),
        generated_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        delta=delta,
    )

    out_path = HISTORY_DIR / f"audit-{now.strftime('%Y-%m-%d-%H%M%S')}.json"
    with open(out_path, "w") as fh:
        json.dump(record, fh, ensure_ascii=False, indent=2)
    print(str(out_path))


if __name__ == "__main__":
    main()
