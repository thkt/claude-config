"""Integration tests for hooks/lifecycle/recall-index.py (SessionStart hook).

The hook names recall by its full path, so the stub goes there through CLAUDE_RECALL_BIN
rather than onto PATH. HOME is swapped as well: the throttle stamp lives under it, and a
test must not read or write the one this machine uses.

Run: python3 hooks/lifecycle/tests/recall_index_test.py
"""

import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "recall-index.py"
STUB_BODY = '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$RECALL_LOG"\n'


class TestRecallIndex(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory(prefix="recall-index-tests-")
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)
        self.stub = self.root / "recall"
        self.stub.write_text(STUB_BODY, encoding="utf-8")
        self.stub.chmod(0o755)
        self.log = self.root / "recall.log"

    def fresh_home(self):
        return Path(tempfile.mkdtemp(dir=self.root, prefix="home"))

    def stamp_for(self, home):
        return home / ".cache" / "claude-recall-index.last"

    def run_hook(self, home, payload="{}", recall_bin=None):
        self.log.write_text("", encoding="utf-8")
        env = dict(
            os.environ,
            HOME=str(home),
            RECALL_LOG=str(self.log),
            CLAUDE_RECALL_BIN=str(recall_bin if recall_bin else self.stub),
        )
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )
        # The hook detaches recall, so the log needs the job to land before it is read.
        for _ in range(20):
            if self.log.stat().st_size:
                break
            time.sleep(0.05)
        return self.log.read_text(encoding="utf-8"), result.stdout

    # 1 メソッドが 2 つ以上を主張するときは subTest で包む。包まないと最初の失敗で残りが
    # 走らず、独立に数えていた sh 版より検出が減る。
    def test_a_first_session_indexes(self):
        """T-001 記録が無ければ index を走らせる"""
        home = self.fresh_home()
        logged, _ = self.run_hook(home)
        with self.subTest("runs index"):
            self.assertIn("index", logged)
        with self.subTest("stamps the run"):
            self.assertTrue(self.stamp_for(home).is_file(), "実行を記録していない")

    def test_a_recent_run_is_skipped(self):
        """T-002 直近に走っていれば起動しない"""
        # 1 日に数十回セッションが始まるので、毎回 embed すると数秒ずつ積み上がる。
        home = self.fresh_home()
        stamp = self.stamp_for(home)
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.touch()
        logged, _ = self.run_hook(home)
        self.assertEqual(logged, "")

    def test_an_old_stamp_lets_it_run(self):
        """T-003 記録が窓を越えていれば走らせる"""
        home = self.fresh_home()
        stamp = self.stamp_for(home)
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.touch()
        old = time.mktime((2020, 1, 1, 0, 0, 0, 0, 0, -1))
        os.utime(stamp, (old, old))
        logged, _ = self.run_hook(home)
        self.assertIn("index", logged)

    def test_a_compaction_restart_is_skipped(self):
        """T-004 compaction による再開では走らせない"""
        # 完了したセッションが増えておらず、生きている transcript は書きかけ。
        home = self.fresh_home()
        logged, _ = self.run_hook(home, '{"source":"compact"}')
        with self.subTest("compact"):
            self.assertEqual(logged, "")
        with self.subTest("no stamp written"):
            self.assertFalse(self.stamp_for(home).is_file(), "記録を書いている")

    def test_a_normal_start_is_not_a_compaction(self):
        """T-005 startup や resume は compaction と区別する"""
        home = self.fresh_home()
        logged, _ = self.run_hook(home, '{"source":"startup"}')
        self.assertIn("index", logged)

    def test_a_missing_binary_is_silent(self):
        """T-006 recall が無ければ黙って抜ける"""
        home = self.fresh_home()
        logged, out = self.run_hook(home, "{}", recall_bin=self.root / "absent")
        with self.subTest("no output"):
            self.assertEqual(out, "")
        with self.subTest("nothing run"):
            self.assertEqual(logged, "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
