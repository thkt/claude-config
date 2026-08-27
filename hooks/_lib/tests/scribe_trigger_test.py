"""Tests for hooks/_lib/scribe_trigger.py.

Run: python3 hooks/_lib/tests/scribe_trigger_test.py
"""

import subprocess
import sys
import tempfile
import unittest
from collections.abc import Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import scribe_trigger


class TestFind(unittest.TestCase):
    def test_git_pull_を渡すと実行ディレクトリが返る(self) -> None:
        """`git pull` を渡すと実行ディレクトリが返る"""
        self.assertEqual(scribe_trigger.find("git pull"), Path.cwd())

    def test_git_pull_origin_main_も同じく返る(self) -> None:
        """`git pull origin main` も同じく返る"""
        self.assertEqual(scribe_trigger.find("git pull origin main"), Path.cwd())

    def test_echo_git_pull_のように語が引数の中にあるだけのときは何も返らない(self) -> None:
        """`echo "git pull"` のように語が引数の中にあるだけのときは何も返らない"""
        self.assertIsNone(scribe_trigger.find('echo "git pull"'))

    def test_git_push_は何も返らない(self) -> None:
        """`git push` は取り込む動作ではないので何も返らない"""
        self.assertIsNone(scribe_trigger.find("git push origin main"))

    def test_cd_チルダ_は_ホーム_へ展開される(self) -> None:
        """`cd ~/.claude && git pull` は実際に打たれる形。展開しないと存在しない
        `<cwd>/~/.claude` を指し、docs/wiki の判定が必ず外れる"""
        self.assertEqual(scribe_trigger.find("cd ~/.claude && git pull"), Path.home() / ".claude")

    def test_cd_path_to_repo_git_pull_は_cd_先を対象にする(self) -> None:
        """`cd /path/to/repo; git pull` は cd 先を対象にする"""
        self.assertEqual(scribe_trigger.find("cd /path/to/repo; git pull"), Path("/path/to/repo"))


class _QueueRunner:
    """Fake gh runner: hands back one canned stdout per call, in call order.

    Popping from an exhausted queue raises, which is what catches an implementation
    that keeps calling gh after the decision is already settled (T-008's contract:
    stop at the first gh call once an unmerged scribe PR is found).
    """

    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)

    def __call__(self, args: Sequence[str]) -> str:  # noqa: ARG002
        return self._responses.pop(0)


def _with_wiki(directory: Path) -> Path:
    (directory / "docs" / "wiki").mkdir(parents=True)
    return directory


class TestGhBinary(unittest.TestCase):
    def test_gh_が_path_に無い環境でも例外を投げない(self) -> None:
        """gh が見つからず例外が出ると、何も起きなかったのと見分けが付かない"""
        with tempfile.TemporaryDirectory() as tmp:
            directory = _with_wiki(Path(tmp))
            stamp = Path(tmp) / "cache" / "last"
            missing = Path(tmp) / "no-such-gh"
            self.assertFalse(
                scribe_trigger.should_prompt(directory, stamp=stamp, gh=missing),
                "gh が無いときは促さない",
            )

    def test_gh_が_非ゼロで終わるときも例外を投げない(self) -> None:
        """認証切れやネットワーク断で gh は非ゼロを返す。促さないだけで済ませる"""

        def failing(args: Sequence[str]) -> str:
            raise subprocess.CalledProcessError(4, ["gh", *args])

        with tempfile.TemporaryDirectory() as tmp:
            directory = _with_wiki(Path(tmp))
            stamp = Path(tmp) / "cache" / "last"
            self.assertFalse(scribe_trigger.should_prompt(directory, stamp=stamp, runner=failing))


class TestShouldPrompt(unittest.TestCase):
    def test_対象に_docs_wiki_が無いとき_促さないと決まる(self) -> None:
        """対象に `docs/wiki/` が無いとき、促さないと決まる"""
        with tempfile.TemporaryDirectory() as tmp:
            target = scribe_trigger.find(f"cd {tmp}; git pull")
            assert target is not None
            stamp = Path(tmp) / "cache" / "claude-scribe_trigger.last"
            self.assertFalse(scribe_trigger.should_prompt(target, stamp=stamp))
            self.assertFalse(stamp.exists(), "対象外のリポジトリは cooldown を始めない")

    def test_未マージ_scribe_pr_が_1_件以上あるとき促さない(self) -> None:
        """未マージ scribe PR が 1 件以上あるとき促さない"""
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            target = _with_wiki(directory)
            stamp = directory / "cache" / "claude-scribe_trigger.last"
            runner = _QueueRunner(['[{"number": 1}]'])
            self.assertFalse(scribe_trigger.should_prompt(target, stamp=stamp, runner=runner))
            self.assertFalse(stamp.exists(), "促さなかった run は cooldown を始めない")

    def test_cursor_以降の入力が_0_件のとき促さない(self) -> None:
        """両方の kind が 0 件のとき促さない。片方だけ見て止まると、もう片方に溜まった入力を落とす"""
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            target = _with_wiki(directory)
            stamp = directory / "cache" / "claude-scribe_trigger.last"
            runner = _QueueRunner(["[]", "2026-01-01T00:00:00Z", "[]", "[]"])
            self.assertFalse(scribe_trigger.should_prompt(target, stamp=stamp, runner=runner))
            self.assertFalse(stamp.exists(), "入力が無い run は cooldown を始めない")

    def test_merged_pr_が_0_件でも_closed_issue_があれば促す(self) -> None:
        """merged PR が 0 件でも、cursor 以降に closed issue が 1 件あれば入力はある"""
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            target = _with_wiki(directory)
            stamp = directory / "cache" / "claude-scribe_trigger.last"
            runner = _QueueRunner(["[]", "2026-01-01T00:00:00Z", "[]", '[{"number": 1}]'])
            self.assertTrue(scribe_trigger.should_prompt(target, stamp=stamp, runner=runner))

    def test_stamp_が_cooldown_内にあるとき促さない(self) -> None:
        """stamp が cooldown 内にあるとき促さない"""
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            target = _with_wiki(directory)
            stamp = directory / "cache" / "claude-scribe_trigger.last"
            stamp.parent.mkdir(parents=True)
            stamp.touch()
            runner = _QueueRunner(["[]", "2026-01-01T00:00:00Z", '[{"number": 5}]'])
            self.assertFalse(scribe_trigger.should_prompt(target, stamp=stamp, runner=runner))

    def test_未マージ_0_件_入力_1_件以上_stamp_が_cooldown_外のとき促す(self) -> None:
        """未マージ 0 件、入力 1 件以上、stamp が cooldown 外のとき促す"""
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            target = _with_wiki(directory)
            stamp = directory / "cache" / "claude-scribe_trigger.last"
            runner = _QueueRunner(["[]", "2026-01-01T00:00:00Z", '[{"number": 5}]'])
            self.assertTrue(scribe_trigger.should_prompt(target, stamp=stamp, runner=runner))
            self.assertTrue(stamp.is_file(), "促した後は stamp が更新されているはず")


if __name__ == "__main__":
    unittest.main()
