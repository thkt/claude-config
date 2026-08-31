#!/opt/homebrew/bin/python3
"""SessionStart hook: catch up recall's cross-session index in the background.

SessionStart rather than SessionEnd. The previous session's transcript is already flushed by
then, SessionEnd can be missed on a hard kill while a missed start self-heals on the next
one, and the indexing takes seconds: detached at teardown it risks being reaped mid-embed,
while at start the session stays alive around it.

Advisory: never blocks the prompt.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this file loadable there.
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

from hook_payload import parse

# The full path, not a PATH lookup: a hook can run without the homebrew prefix, where the
# lookup would silently skip every session. The override lets the tests hand over a stub.
DEFAULT_RECALL = "/opt/homebrew/bin/recall"

# Worst-case staleness: a session that completes just after a run waits this long to become
# searchable. recall answers questions about days-old decisions, so hours cost nothing, and
# the bound is what keeps dozens of session starts a day from each paying for an embed.
WINDOW_MINUTES = 180


def _stamp() -> Path:
    """Read at call time, not at import: the tests swap HOME to keep this machine's own
    stamp out of the run."""
    return Path.home() / ".cache" / "claude-recall_index.last"


def _recently_indexed(stamp: Path) -> bool:
    try:
        return time.time() - stamp.stat().st_mtime < WINDOW_MINUTES * 60
    except OSError:
        return False


def main() -> None:
    # A compaction restart brings no newly completed session, and the live transcript is
    # mid-write. recall searches past sessions, never the live one.
    if parse(sys.stdin.read()).get("source") == "compact":
        return
    recall = Path(os.environ.get("CLAUDE_RECALL_BIN") or DEFAULT_RECALL)
    if not recall.is_file() or not os.access(recall, os.X_OK):
        return

    stamp = _stamp()
    if _recently_indexed(stamp):
        return
    try:
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.touch()
    except OSError:
        return

    # Detached so the embed never delays the prompt. SQLite WAL serializes concurrent
    # writers, so parallel session starts need no lock of their own.
    _ = subprocess.Popen(
        [str(recall), "index"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


if __name__ == "__main__":
    main()
