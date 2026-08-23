# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/lifecycle/recall_index.py (SessionStart hook).

The hook names recall by its full path, so the stub goes there through CLAUDE_RECALL_BIN
rather than onto PATH. HOME is swapped as well: the throttle stamp lives under it, and a
test must not read or write the one this machine uses.

Run: python3 hooks/lifecycle/tests/recall_index_test.py
"""

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import override

HOOK = Path(__file__).resolve().parents[1] / "recall_index.py"

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_lib"))

import hook_harness  # noqa: E402

STUB_BODY = '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$RECALL_LOG"\n'


class TestRecallIndex(unittest.TestCase):
    # Declared here because setUp fills them: an attribute first seen inside a method
    # carries no type for a checker.
    tmpdir: tempfile.TemporaryDirectory[str]
    root: Path
    stub: Path
    log: Path

    @override
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory(prefix="recall_index-tests-")
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)
        self.stub = self.root / "recall"
        _ = self.stub.write_text(STUB_BODY, encoding="utf-8")
        self.stub.chmod(0o755)
        self.log = self.root / "recall.log"

    def fresh_home(self) -> Path:
        return Path(tempfile.mkdtemp(dir=self.root, prefix="home"))

    def stamp_for(self, home: Path) -> Path:
        return home / ".cache" / "claude-recall_index.last"

    def run_hook(
        self, home: Path, payload: str = "{}", recall_bin: Path | None = None
    ) -> tuple[str, str]:
        _ = self.log.write_text("", encoding="utf-8")
        env = dict(
            os.environ,
            HOME=str(home),
            RECALL_LOG=str(self.log),
            CLAUDE_RECALL_BIN=str(recall_bin if recall_bin else self.stub),
        )
        stdout = hook_harness.run(HOOK, payload, env)
        # The hook detaches recall, so the log needs the job to land before it is read.
        for _ in range(20):
            if self.log.stat().st_size:
                break
            time.sleep(0.05)
        return self.log.read_text(encoding="utf-8"), stdout

    # A method asserting two or more things wraps each in subTest. Without it the first
    # failure skips the rest, detecting less than the sh version that counted them apart.
    def test_a_first_session_indexes(self) -> None:
        """T-001 With no record on file, the index runs"""
        home = self.fresh_home()
        logged, _ = self.run_hook(home)
        with self.subTest("runs index"):
            self.assertIn("index", logged)
        with self.subTest("stamps the run"):
            self.assertTrue(self.stamp_for(home).is_file(), "no stamp written")

    def test_a_recent_run_is_skipped(self) -> None:
        """T-002 A recent run keeps it from starting"""
        # Sessions start dozens of times a day, so embedding on each one piles up seconds.
        home = self.fresh_home()
        stamp = self.stamp_for(home)
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.touch()
        logged, _ = self.run_hook(home)
        self.assertEqual(logged, "")

    def test_an_old_stamp_lets_it_run(self) -> None:
        """T-003 A record past the window lets it run"""
        home = self.fresh_home()
        stamp = self.stamp_for(home)
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.touch()
        old = time.mktime((2020, 1, 1, 0, 0, 0, 0, 0, -1))
        os.utime(stamp, (old, old))
        logged, _ = self.run_hook(home)
        self.assertIn("index", logged)

    def test_a_compaction_restart_is_skipped(self) -> None:
        """T-004 A restart from compaction does not run it"""
        # No finished session has been added, and the transcript still open is mid-write.
        home = self.fresh_home()
        logged, _ = self.run_hook(home, '{"source":"compact"}')
        with self.subTest("compact"):
            self.assertEqual(logged, "")
        with self.subTest("no stamp written"):
            self.assertFalse(self.stamp_for(home).is_file(), "a stamp was written")

    def test_a_normal_start_is_not_a_compaction(self) -> None:
        """T-005 startup and resume are told apart from compaction"""
        home = self.fresh_home()
        logged, _ = self.run_hook(home, '{"source":"startup"}')
        self.assertIn("index", logged)

    def test_a_missing_binary_is_silent(self) -> None:
        """T-006 With recall absent it exits without a word"""
        home = self.fresh_home()
        logged, out = self.run_hook(home, "{}", recall_bin=self.root / "absent")
        with self.subTest("no output"):
            self.assertEqual(out, "")
        with self.subTest("nothing run"):
            self.assertEqual(logged, "")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
