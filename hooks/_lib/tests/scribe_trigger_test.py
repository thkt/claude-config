"""Tests for hooks/_lib/scribe_trigger.py.

Run: python3 hooks/_lib/tests/scribe_trigger_test.py
"""

import sys
import tempfile
import unittest
from collections.abc import Sequence
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

    def test_cd_path_to_repo_gh_pr_merge_1_は_cd_先を対象にする(self) -> None:
        """`cd /path/to/repo; gh pr merge 1` は cd 先を対象にする"""
        trigger = scribe_trigger.find("cd /path/to/repo; gh pr merge 1")
        assert trigger is not None
        self.assertEqual(trigger.directory, Path("/path/to/repo"))

    def test_gh_issue_close_2_repo_owner_name_は_repo_の値を対象にする(self) -> None:
        """`gh issue close 2 --repo owner/name` は `--repo` の値を対象にする"""
        trigger = scribe_trigger.find("gh issue close 2 --repo owner/name")
        assert trigger is not None
        self.assertEqual(trigger.kind, "issue")
        self.assertEqual(trigger.directory, Path("owner/name"))


class _QueueRunner:
    """Fake gh runner: hands back one canned stdout per call, in call order.

    Popping from an exhausted queue raises, which is what catches an implementation
    that keeps calling gh after the decision is already settled (T-008's contract:
    stop at the first gh call once an unmerged scribe PR is found).
    """

    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)

    def __call__(self, args: Sequence[str]) -> str:
        return self._responses.pop(0)


def _trigger_with_wiki(directory: Path) -> scribe_trigger.Trigger:
    (directory / "docs" / "wiki").mkdir(parents=True)
    return scribe_trigger.Trigger("pr", directory)


class TestShouldPrompt(unittest.TestCase):
    def test_対象に_docs_wiki_が無いとき_促さないと決まる(self) -> None:
        """対象に `docs/wiki/` が無いとき、促さないと決まる"""
        with tempfile.TemporaryDirectory() as tmp:
            trigger = scribe_trigger.find(f"cd {tmp}; gh pr merge 1")
            assert trigger is not None
            self.assertFalse(scribe_trigger.should_prompt(trigger))

    def test_未マージ_scribe_pr_が_1_件以上あるとき促さない(self) -> None:
        """未マージ scribe PR が 1 件以上あるとき促さない"""
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            trigger = _trigger_with_wiki(directory)
            stamp = directory / "cache" / "claude-scribe_trigger.last"
            runner = _QueueRunner(['[{"number": 1}]'])
            self.assertFalse(scribe_trigger.should_prompt(trigger, stamp=stamp, runner=runner))

    def test_cursor_以降の入力が_0_件のとき促さない(self) -> None:
        """cursor 以降の入力が 0 件のとき促さない"""
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            trigger = _trigger_with_wiki(directory)
            stamp = directory / "cache" / "claude-scribe_trigger.last"
            runner = _QueueRunner(["[]", "2026-01-01T00:00:00Z", "[]"])
            self.assertFalse(scribe_trigger.should_prompt(trigger, stamp=stamp, runner=runner))

    def test_stamp_が_cooldown_内にあるとき促さない(self) -> None:
        """stamp が cooldown 内にあるとき促さない"""
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            trigger = _trigger_with_wiki(directory)
            stamp = directory / "cache" / "claude-scribe_trigger.last"
            stamp.parent.mkdir(parents=True)
            stamp.touch()
            runner = _QueueRunner(["[]", "2026-01-01T00:00:00Z", '[{"number": 5}]'])
            self.assertFalse(scribe_trigger.should_prompt(trigger, stamp=stamp, runner=runner))

    def test_未マージ_0_件_入力_1_件以上_stamp_が_cooldown_外のとき促す(self) -> None:
        """未マージ 0 件、入力 1 件以上、stamp が cooldown 外のとき促す"""
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            trigger = _trigger_with_wiki(directory)
            stamp = directory / "cache" / "claude-scribe_trigger.last"
            runner = _QueueRunner(["[]", "2026-01-01T00:00:00Z", '[{"number": 5}]'])
            self.assertTrue(scribe_trigger.should_prompt(trigger, stamp=stamp, runner=runner))
            self.assertTrue(stamp.is_file(), "促した後は stamp が更新されているはず")


if __name__ == "__main__":
    unittest.main()
