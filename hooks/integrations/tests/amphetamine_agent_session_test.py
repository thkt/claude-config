# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/integrations/amphetamine_agent_session.py.

osascript is replaced by a stub on PATH, so the assertions read the commands the hook sent to
Amphetamine rather than the state of a real Mac.

Run: python3 hooks/integrations/tests/amphetamine_agent_session_test.py
"""

import json
import os
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import override

HOOK_DIR = Path(__file__).resolve().parents[1]
HOOK = HOOK_DIR / "amphetamine_agent_session.py"

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_lib"))

import hook_harness  # noqa: E402

sys.path.insert(0, str(HOOK_DIR))
import amphetamine_agent_session as hook  # noqa: E402

# Records every command the hook sends and answers `session time remaining` with the value
# the test pinned in STUB_REMAINING.
STUB_OSASCRIPT = """#!/bin/sh
printf '%s\\n' "$*" >> "$OSASCRIPT_LOG"
case "$*" in
  *"session time remaining"*) printf '%s\\n' "${STUB_REMAINING:--3}" ;;
esac
exit 0
"""

# 0 is Amphetamine's code for an infinite session, which only a person starts by hand.
INFINITE = "0"
NO_SESSION = str(hook.NO_SESSION)


class TestAmphetamineAgentSession(unittest.TestCase):
    tmpdir: tempfile.TemporaryDirectory[str]
    state_dir: Path
    log: Path
    app: Path
    env: dict[str, str]

    @override
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory(prefix="amphetamine-tests-")
        self.addCleanup(self.tmpdir.cleanup)
        root = Path(self.tmpdir.name)

        stub_bin = root / "bin"
        stub_bin.mkdir()
        stub = stub_bin / "osascript"
        _ = stub.write_text(STUB_OSASCRIPT, encoding="utf-8")
        stub.chmod(0o755)

        # A directory standing in for the installed app, so the suite runs on a machine
        # without it. Each test gets its own state directory, so a marker never leaks between
        # tests or from a real run on this machine.
        self.app = root / "Amphetamine.app"
        self.app.mkdir()
        self.state_dir = root / "state"
        self.log = root / "osascript.log"
        self.log.touch()

        self.env = {
            **os.environ,
            "PATH": f"{stub_bin}{os.pathsep}{os.environ['PATH']}",
            "OSASCRIPT_LOG": str(self.log),
            "CLAUDE_AMPHETAMINE_STATE_DIR": str(self.state_dir),
        }
        # Most assertions below expect silence, and an unreachable osascript produces the same
        # silence. That is what a replaced (rather than merged) env leaves behind.
        self.assertEqual(shutil.which("osascript", path=self.env["PATH"]), str(stub))

    def run_hook(
        self,
        action: str,
        session_id: str = "test-session",
        remaining: str = NO_SESSION,
        agent_id: str | None = None,
        app: Path | None = None,
    ) -> str:
        payload: dict[str, object] = {"session_id": session_id}
        if agent_id is not None:
            payload["agent_id"] = agent_id
        return self.run_hook_payload(action, payload, remaining, app)

    def run_hook_payload(
        self,
        action: str,
        payload: dict[str, object],
        remaining: str = NO_SESSION,
        app: Path | None = None,
    ) -> str:
        env = {
            **self.env,
            "STUB_REMAINING": remaining,
            "CLAUDE_AMPHETAMINE_APP": str(app or self.app),
        }
        return hook_harness.run(HOOK, payload, env, args=[action])

    def sent(self) -> str:
        return self.log.read_text(encoding="utf-8")

    def clear_log(self) -> None:
        _ = self.log.write_text("", encoding="utf-8")

    def markers(self, prefix: str = "session-") -> list[Path]:
        return sorted(self.state_dir.glob(f"{prefix}*"))

    def backdate(self, path: Path, minutes: int) -> None:
        stamp = time.time() - minutes * 60
        os.utime(path, (stamp, stamp))

    def test_acquire_starts_a_session(self) -> None:
        """T-001: With no session it sends start new session and leaves a marker"""
        _ = self.run_hook("acquire", "session-a")
        self.assertIn("start new session", self.sent())
        # The finite duration is the dead-man's switch: a killed process leaves no Stop hook,
        # and an infinite session would then keep the Mac awake until someone notices.
        self.assertIn("duration:60, interval:minutes", self.sent())
        self.assertIn("displaySleepAllowed:false", self.sent())
        # Setting closed-display mode per session drops the display for a second with the
        # lid shut.
        self.assertNotIn("closed display mode", self.sent())
        self.assertEqual(len(self.markers()), 1)

    def test_acquire_leaves_a_foreign_session_alone(self) -> None:
        """T-002: A manual session already running draws nothing"""
        _ = self.run_hook("acquire", "session-a", INFINITE)
        self.assertNotIn("start new session", self.sent())
        self.assertEqual(self.markers(), [])

    def test_acquire_refreshes_a_session_it_owns(self) -> None:
        """T-003: With its own marker it reissues, even with time remaining"""
        _ = self.run_hook("acquire", "session-a")
        self.clear_log()
        _ = self.run_hook("acquire", "session-a", "1800")
        self.assertIn("start new session", self.sent())
        self.assertEqual(len(self.markers()), 1)

    def test_release_ends_the_last_session(self) -> None:
        """T-004: The last one closing sends end session"""
        _ = self.run_hook("acquire", "session-a")
        self.clear_log()
        _ = self.run_hook("release", "session-a", "1800")
        self.assertIn("end session", self.sent())
        self.assertEqual(self.markers(), [])

    def test_release_keeps_another_process_awake(self) -> None:
        """T-005: Another process mid-turn holds back end session"""
        _ = self.run_hook("acquire", "session-a")
        _ = self.run_hook("acquire", "session-b")
        self.clear_log()
        _ = self.run_hook("release", "session-a", "1800")
        self.assertNotIn("end session", self.sent())
        self.assertEqual(len(self.markers()), 1)

    def test_a_second_process_joins_the_count(self) -> None:
        """T-018: A turn starting during an earlier process session counts as a reference"""
        # On a real machine remaining turns positive the moment the first one starts, so the
        # second acquire always takes this path. Miscounting here reads the first release as
        # the last one.
        _ = self.run_hook("acquire", "session-a")
        _ = self.run_hook("acquire", "session-b", "1800")
        self.assertEqual(len(self.markers()), 2)
        self.clear_log()
        _ = self.run_hook("release", "session-a", "1800")
        self.assertNotIn("end session", self.sent())

    def test_a_manual_session_is_still_left_alone(self) -> None:
        """T-019: A session with no marker at all counts as manual and is left alone"""
        _ = self.run_hook("acquire", "session-a", "1800")
        self.assertNotIn("start new session", self.sent())
        self.assertEqual(self.markers(), [])

    def test_release_leaves_an_infinite_session_alone(self) -> None:
        """T-006: A switch to a manual infinite session partway through holds it open"""
        _ = self.run_hook("acquire", "session-a")
        self.clear_log()
        _ = self.run_hook("release", "session-a", INFINITE)
        self.assertNotIn("end session", self.sent())

    def test_release_leaves_a_longer_session_alone(self) -> None:
        """T-007: Time remaining past what it issued holds it open"""
        _ = self.run_hook("acquire", "session-a")
        self.clear_log()
        # 2 hours: longer than the 60 minutes this hook ever asks for, so a person set it.
        _ = self.run_hook("release", "session-a", "7200")
        self.assertNotIn("end session", self.sent())

    def test_subagent_payload_is_ignored(self) -> None:
        """T-008: A call originating in a subagent sends nothing"""
        payload = json.dumps({"session_id": "session-a", "agent_id": "agent-1"})
        self.assertIsNone(hook.session_id(payload, "acquire"))
        _ = self.run_hook("acquire", "session-a", agent_id="agent-1")
        self.assertEqual(self.sent(), "")
        self.assertEqual(self.markers(), [])

    def test_missing_app_is_silent(self) -> None:
        """T-009: With Amphetamine absent it exits without a word"""
        absent = Path(self.tmpdir.name) / "absent.app"
        self.assertEqual(self.run_hook("acquire", "session-a", app=absent), "")
        self.assertEqual(self.sent(), "")

    def test_stale_marker_is_swept(self) -> None:
        """T-010: A marker past 8 hours is dropped and does not hold the reference count"""
        _ = self.run_hook("acquire", "session-a")
        _ = self.run_hook("acquire", "session-b")
        stale = self.state_dir / "session-session-b"
        # A renamed marker scheme would leave this assertion as the only thing between the
        # sweep and a test that backdates nothing and passes.
        self.assertTrue(stale.is_file())
        self.backdate(stale, hook.STALE_MINUTES + 60)
        self.clear_log()
        _ = self.run_hook("release", "session-a", "1800")
        self.assertIn("end session", self.sent())
        self.assertEqual(self.markers(), [])

    def test_unknown_action_is_silent(self) -> None:
        """T-011: An argument other than acquire/release sends nothing"""
        _ = self.run_hook("status", "session-a")
        self.assertEqual(self.sent(), "")

    def test_background_from_a_subagent_keeps_the_mac_awake(self) -> None:
        """T-012: A tool call from a subagent reissues the session and leaves a bg marker"""
        _ = self.run_hook_payload(
            "background", {"session_id": "session-a", "agent_id": "agent-1", "tool_name": "Bash"}
        )
        self.assertIn("start new session", self.sent())
        self.assertEqual(len(self.markers("bg-")), 1)

    def test_background_from_a_workflow_launch(self) -> None:
        """T-013: A Workflow launched from the main turn leaves a bg marker too"""
        _ = self.run_hook_payload(
            "background", {"session_id": "session-a", "tool_name": "Workflow"}
        )
        self.assertIn("start new session", self.sent())
        self.assertEqual(len(self.markers("bg-")), 1)

    def test_background_ignores_a_quoted_agent_id(self) -> None:
        """T-014: A main-turn call merely carrying the string agent_id is dropped"""
        # An empty agent_id is falsy, so the subagent branch does not take it and a main-turn
        # Bash call is left as main-turn.
        empty = {"session_id": "session-a", "tool_name": "Bash", "agent_id": ""}
        self.assertIsNone(hook.session_id(json.dumps(empty), "background"))
        _ = self.run_hook_payload("background", empty)
        self.assertEqual(self.sent(), "")
        # A substring filter over the raw payload would read this content as the key. The
        # check reads the parsed key, so text carrying the name does not reach it.
        quoted = {
            "session_id": "session-a",
            "tool_name": "Write",
            "tool_input": {"content": 'case $payload in *"agent_id"*)'},
        }
        _ = self.run_hook_payload("background", quoted)
        self.assertEqual(self.sent(), "")
        self.assertEqual(self.markers("bg-"), [])

    def test_background_throttles_repeat_calls(self) -> None:
        """T-015: Issued recently, it does not call osascript"""
        payload = {"session_id": "session-a", "agent_id": "agent-1"}
        _ = self.run_hook_payload("background", payload)
        self.clear_log()
        _ = self.run_hook_payload("background", payload)
        self.assertEqual(self.sent(), "")
        self.assertEqual(len(self.markers("bg-")), 1)

    def test_background_leaves_a_foreign_session_alone(self) -> None:
        """T-016: A manual session already running draws no bg marker"""
        _ = self.run_hook_payload(
            "background", {"session_id": "session-a", "agent_id": "agent-1"}, INFINITE
        )
        self.assertNotIn("start new session", self.sent())
        self.assertEqual(self.markers("bg-"), [])

    def test_release_extends_while_a_workflow_runs(self) -> None:
        """T-017: A fresh bg marker reissues the session rather than ending it"""
        _ = self.run_hook("acquire", "session-a")
        _ = self.run_hook_payload(
            "background", {"session_id": "session-a", "agent_id": "agent-1"}, "1800"
        )
        self.clear_log()
        _ = self.run_hook("release", "session-a", "1800")
        self.assertNotIn("end session", self.sent())
        self.assertIn("start new session", self.sent())
        self.assertEqual(len(self.markers("bg-")), 1)

    def test_release_closes_when_the_bg_marker_went_stale(self) -> None:
        """T-024: A stale bg marker sends end session and clears the marker"""
        _ = self.run_hook("acquire", "session-a")
        _ = self.run_hook_payload(
            "background", {"session_id": "session-a", "agent_id": "agent-1"}, "1800"
        )
        # Past the freshness window the release path reads, and short of the 8-hour sweep, so
        # the assertion covers the freshness test rather than the sweep.
        self.backdate(self.state_dir / "bg-session-a", hook.BG_FRESH_MINUTES + 5)
        self.clear_log()
        _ = self.run_hook("release", "session-a", "1800")
        self.assertIn("end session", self.sent())
        self.assertEqual(self.markers("bg-"), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
