#!/opt/homebrew/bin/python3
"""Hold the Mac awake while a turn is working, via Amphetamine.

UserPromptSubmit calls acquire, Stop calls release, PostToolUse calls background.

Global settings.json fires this in every Claude Code process on the machine, so a marker per
session_id counts the references and only the last one closes the session. A turn ending does
not mean the work ended: workflows and subagents keep running, so background stamps a second
marker and release extends the session while that stamp is fresh.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this file loadable there.
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

# re, shutil and subprocess load inside the functions that need them. This hook fires on
# every tool call and nearly every run returns before reaching one.

# How long a session runs. Should the Stop hook never fire, it lapses on its own. release
# reads it as the upper bound of what it recognizes as its own, so nothing longer is issued.
SESSION_MINUTES = 60
# The display stays lit as well, not just the machine and the network.
DISPLAY_SLEEP_ALLOWED = "false"
# osascript can sit on a modal Amphetamine raises. This hook fires on every tool call, so a
# blocked call would wedge the turn.
AMPH_TIMEOUT_SECONDS = 5
# background returns without calling osascript until this long after the last issue.
BG_REFRESH_MINUTES = 5
# How fresh a bg marker has to be for release to read it as work still running.
BG_FRESH_MINUTES = 15
# A marker older than this belongs to a process whose release never fired.
STALE_MINUTES = 480

DEFAULT_APP = "/Applications/Amphetamine.app"
DEFAULT_STATE_DIR = Path.home() / "Library" / "Application Support" / "claude-amphetamine"

# Amphetamine answers `session time remaining` in seconds, with 0 for an endless session and
# a negative code for one it did not issue itself (-3 meaning none is running).
NO_SESSION = -3


def _amph(app_command: str) -> str:
    import subprocess

    try:
        result = subprocess.run(
            ["osascript", "-e", f'tell application "Amphetamine" to {app_command}'],
            capture_output=True,
            text=True,
            check=False,
            timeout=AMPH_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def start_session() -> None:
    """The only place a session is issued: release's ownership test assumes the length."""
    # Closed-display mode stays Amphetamine's own preference. Setting it per session drops the
    # display for a second on every swap when the lid is shut.
    options = (
        f"duration:{SESSION_MINUTES}, interval:minutes, "
        + f"displaySleepAllowed:{DISPLAY_SLEEP_ALLOWED}"
    )
    _ = _amph(f"start new session with options {{{options}}}")


def remaining() -> int | None:
    """None when Amphetamine answered with something unreadable, which leaves every caller
    on the side that touches nothing."""
    try:
        return int(_amph("session time remaining"))
    except ValueError:
        return None


def session_id(payload_text: str, action: str) -> str | None:
    """The session a call belongs to, or None when this hook should ignore it.

    acquire and release open and close the main turn, so a subagent-born call would double
    count them. background exists for the opposite reason: only a subagent or a Workflow /
    Agent spawn tells this hook that work outlives the turn.
    """
    import re

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))
    from hook_payload import parse

    payload = parse(payload_text)
    from_agent = bool(payload.get("agent_id"))
    if action == "background":
        if not from_agent and payload.get("tool_name") not in ("Workflow", "Agent"):
            return None
    elif from_agent:
        return None
    value = payload.get("session_id")
    if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
        return value
    return None


def _fresh(path: Path, minutes: int) -> bool:
    try:
        return time.time() - path.stat().st_mtime < minutes * 60
    except OSError:
        return False


def _any_fresh(state_dir: Path, prefix: str, minutes: int) -> bool:
    return any(_fresh(p, minutes) for p in state_dir.glob(f"{prefix}*"))


def _markers(state_dir: Path) -> bool:
    return any(state_dir.glob("session-*")) or any(state_dir.glob("bg-*"))


def _sweep(state_dir: Path) -> None:
    for path in list(state_dir.glob("session-*")) + list(state_dir.glob("bg-*")):
        if not _fresh(path, STALE_MINUTES):
            path.unlink(missing_ok=True)


def _foreign_session(state_dir: Path, marker: Path, bg_marker: Path) -> bool:
    """A session no Claude Code process started, which taking over would cut short.

    Any marker in the directory means the running session is ours: the first process starts
    one the moment it acquires, so every later turn sees a positive remaining time and would
    otherwise stand aside without joining the count.
    """
    if marker.is_file() or bg_marker.is_file() or _markers(state_dir):
        return False
    return remaining() != NO_SESSION


def _release(state_dir: Path, marker: Path, bg_marker: Path) -> None:
    marker.unlink(missing_ok=True)

    # Another Claude Code process is still mid-turn, so its session stays.
    if any(state_dir.glob("session-*")):
        return

    # 0 is endless and a negative value is a session from elsewhere. Longer than this hook
    # ever issues means a manual one slipped in.
    left = remaining()
    if left is None or left <= 0 or left > SESSION_MINUTES * 60:
        return

    # A workflow or subagent still running extends the session past the turn. Nothing reports
    # their end, so the next release closes it once the marker has gone stale.
    if _any_fresh(state_dir, "bg-", BG_FRESH_MINUTES):
        start_session()
        return

    bg_marker.unlink(missing_ok=True)
    _ = _amph("end session")


def run(action: str, payload_text: str, state_dir: Path) -> None:
    sid = session_id(payload_text, action)
    if sid is None:
        return
    try:
        state_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        return
    _sweep(state_dir)

    marker = state_dir / f"session-{sid}"
    bg_marker = state_dir / f"bg-{sid}"

    if action == "release":
        _release(state_dir, marker, bg_marker)
        return

    if action == "background" and _fresh(bg_marker, BG_REFRESH_MINUTES):
        return
    if _foreign_session(state_dir, marker, bg_marker):
        return
    (bg_marker if action == "background" else marker).touch()
    start_session()


def main() -> None:
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    if action not in ("acquire", "release", "background"):
        return
    app = os.environ.get("CLAUDE_AMPHETAMINE_APP") or DEFAULT_APP
    if not Path(app).is_dir():
        return

    import shutil

    if not shutil.which("osascript"):
        return
    state_dir = os.environ.get("CLAUDE_AMPHETAMINE_STATE_DIR") or DEFAULT_STATE_DIR
    run(action, sys.stdin.read(), Path(state_dir))


if __name__ == "__main__":
    main()
