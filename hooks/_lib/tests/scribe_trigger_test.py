"""Tests for hooks/_lib/scribe_trigger.py.

Run: python3 hooks/_lib/tests/scribe_trigger_test.py
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import scribe_trigger


class TestFind(unittest.TestCase):
    def test_gh_pr_merge_1_merge_を渡すと_pr_契機が返る(self) -> None:
        """`gh pr merge 1 --merge` を渡すと pr 契機が返る"""
        trigger = scribe_trigger.find("gh pr merge 1 --merge")
        assert trigger is not None
        self.assertEqual(trigger.kind, "pr")
        self.assertEqual(trigger.directory, Path.cwd())

    def test_gh_issue_close_2_を渡すと_issue_契機が返る(self) -> None:
        """`gh issue close 2` を渡すと issue 契機が返る"""
        trigger = scribe_trigger.find("gh issue close 2")
        assert trigger is not None
        self.assertEqual(trigger.kind, "issue")
        self.assertEqual(trigger.directory, Path.cwd())

    def test_echo_gh_pr_merge_のように語が引数の中にあるだけのときは何も返らない(self) -> None:
        """`echo "gh pr merge"` のように語が引数の中にあるだけのときは何も返らない"""
        self.assertIsNone(scribe_trigger.find('echo "gh pr merge"'))

    def test_for_n_in_1_2_do_gh_issue_close_n_done_は何も返らない(self) -> None:
        """`for n in 1 2; do gh issue close $n; done` は何も返らない"""
        self.assertIsNone(scribe_trigger.find("for n in 1 2; do gh issue close $n; done"))


if __name__ == "__main__":
    unittest.main()
