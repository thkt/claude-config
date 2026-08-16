"""Integration tests for hooks/lifecycle/reflection-ask.py (Stop hook).

HOME is overridden per test so the record of the last asked session starts absent.

Run: python3 hooks/lifecycle/tests/reflection_ask_test.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "reflection-ask.py"
HERE = Path(__file__).resolve().parent


class TestReflectionAsk(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory(prefix="reflection-ask-test")
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)
        self.transcript = self.root / "transcript.jsonl"

    def fresh_home(self):
        return Path(tempfile.mkdtemp(dir=self.root, prefix="home"))

    # cwd defaults to this test directory, so the default path exercises the root resolution
    # rather than a lucky top-level run.
    def run_hook(self, home, session_id="test-session", cwd=None):
        payload = json.dumps(
            {
                "session_id": session_id,
                "cwd": str(cwd if cwd else HERE),
                "transcript_path": str(self.transcript),
                "hook_event_name": "Stop",
                "stop_hook_active": False,
            }
        )
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
            env=dict(os.environ, HOME=str(home)),
        )
        return result.stdout

    def message_from(self, output):
        if not output.strip():
            return ""
        try:
            return json.loads(output).get("hookSpecificOutput", {}).get("additionalContext", "")
        except json.JSONDecodeError:
            return ""

    def run_message(self, home, session_id="test-session", cwd=None):
        return self.message_from(self.run_hook(home, session_id, cwd))

    def test_second_call_in_same_session_is_silent(self):
        """T-001 同じセッションで 2 度目が来ると何も返さず終わる"""
        home = self.fresh_home()
        with self.subTest("1st call returns an additionalContext"):
            self.assertIn('"additionalContext"', self.run_hook(home, "session-a"))
        with self.subTest("2nd call in the same session returns nothing"):
            self.assertEqual(self.run_hook(home, "session-a"), "")

    def test_new_session_returns_additionalContext(self):
        """T-002 セッションが変われば additionalContext を返し、端末には出さない"""
        home = self.fresh_home()
        self.run_hook(home, "session-a")
        output = self.run_hook(home, "session-b")
        with self.subTest("additionalContext key present"):
            self.assertIn('"additionalContext"', output)
        # The instruction addresses the agent, so a systemMessage would print the same 700
        # characters into the terminal and bury the turn's own answer.
        with self.subTest("no systemMessage key"):
            self.assertNotIn('"systemMessage"', output)

    def test_question_leaves_nothing_when_there_is_nothing(self):
        """T-003 問いの文言は、残すものが無いとき何も書かないよう求める"""
        message = self.run_message(self.fresh_home())
        # One contiguous pattern rather than two halves: matched separately, a prompt that asks
        # for an entry when there is nothing and says 何も書かない elsewhere still passes.
        self.assertIn("残すものが無ければ何も書かない", message)

    def test_additionalcontext_path_has_real_file(self):
        """T-005 additionalContext が指すパスに実ファイルがある"""
        message = self.run_message(self.fresh_home())
        found = re.search(r"/[A-Za-z0-9_./-]+/\.claude/rules/CORRECTIONS\.md", message)
        with self.subTest("names an absolute .claude/rules path"):
            self.assertIsNotNone(found, "絶対パスを名指ししていない")
        with self.subTest("the named path exists as a real file"):
            self.assertTrue(found and Path(found.group()).is_file(), "指したパスに実ファイルが無い")

    # An unresolved relative path lands the entry in whichever tree the caller happened to be in.
    def test_subdirectory_resolves_to_repository_root(self):
        """T-006 サブディレクトリの cwd でもリポジトリルートを指す"""
        repo_root = HERE.parents[2]
        message = self.run_message(self.fresh_home(), "session-subdir", HERE)
        self.assertIn(f"{repo_root}/.claude/rules/CORRECTIONS.md", message)

    def test_outside_a_repository_is_silent(self):
        """T-007 リポジトリ外の cwd では何も返さない"""
        outside = Path(tempfile.mkdtemp(dir=self.root, prefix="outside"))
        self.assertEqual(self.run_hook(self.fresh_home(), "session-outside", outside), "")

    def test_write_is_delegated_to_a_subagent(self):
        """T-008 追記を subagent へ委ね、呼ばれた側は自分で書かない"""
        message = self.run_message(self.fresh_home())
        # The delegation clause, not the bare word: the prompt names subagent a dozen times, so
        # the word alone passes even when the instruction to delegate is gone.
        for phrase in (
            "subagent 1 体に任せる",
            "あなた自身は追記しない",
            str(self.transcript),
            # Naming the file alone leaves the creation of a missing .claude/rules to the
            # subagent's judgment.
            "追記先へ至るディレクトリが無ければ作り",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, message)

    def test_question_asks_for_tidying_in_the_same_pass(self):
        """T-009 追記と同じ回に掃除を求め、報告を 1 行に絞る"""
        message = self.run_message(self.fresh_home())
        for phrase in (
            "追記と掃除を同じ回に行う",
            # Reading the real file, not the entry's own claim: the entry that says the wiring
            # was removed stays true as prose while settings.json no longer holds it.
            "消す前に現物を読み、書かれた状態と食い違うことを確かめる",
            # Two assertions rather than one: the noun phrase alone passes even if the row's
            # disposition is inverted to 消す, so the keep list is pinned separately.
            "消さないものは",
            "確かめられなかった行",
            # A row whose lesson was applied reads as stale, and deleting it drops the only
            # recorded way to notice that class of bug.
            "一度きりの事象報告に留まる行を消す",
            "他所の規則ファイルへ移せる規則",
            "「外部ツールの実測挙動」",
            "「ハーネスの教訓」",
            # The table holds cells over 1700 chars and the formatter duplicates rows on a
            # partial edit of a full-width table, so restructuring stays out of the automated path.
            "見出しの新設も、既存行の並べ替えもしない",
            "「追記 N 件、削除 M 件、統合 K 件」の 1 行に限る",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, message)

    def test_script_never_launches_claude(self):
        """T-004 スクリプトは claude を起動する行を持たない"""
        with self.subTest("hook script exists"):
            self.assertTrue(HOOK.is_file() and HOOK.stat().st_size, "hook が無い")
        # Invocation forms, not the bare word: the session record is named
        # claude-reflection-ask.session, which the word alone would hit.
        code = "\n".join(
            line
            for line in HOOK.read_text(encoding="utf-8").splitlines()
            if not line.lstrip().startswith("#")
        )
        for form in ("claude ", "`claude", "$(claude"):
            with self.subTest(form=form):
                self.assertNotIn(form, code)

    # A repository built here rather than this one: the threshold reads the real backlog, so a
    # test against this repository would pass or fail on however many rows happen to be queued.
    def make_backlog_repo(self, target, rows):
        repo = Path(tempfile.mkdtemp(dir=self.root, prefix="repo"))
        subprocess.run(["git", "-C", str(repo), "init", "-q"], check=False, capture_output=True)
        rules = repo / ".claude" / "rules"
        rules.mkdir(parents=True)
        body = ["# Corrections", "", "## 外部ツールの実測挙動", "", "| 訂正・知見 | 対象 |", "| --- | --- |"]
        body += [f"| entry {i} | `{target}` |" for i in range(1, rows + 1)]
        (rules / "CORRECTIONS.md").write_text("\n".join(body) + "\n", encoding="utf-8")
        return repo

    def test_backlog_at_threshold_asks_for_integration(self):
        """T-010 同じ対象が 3 行溜まると統合まで求める"""
        repo = self.make_backlog_repo("skills/demo/SKILL.md", 3)
        message = self.run_message(self.fresh_home(), "session-backlog", repo)
        for phrase in (
            "skills/demo/SKILL.md",
            "3 行",
            # Distillation, not relocation: moving the cells verbatim reproduces the unreadable
            # table in the target file instead of turning the rows into a rule.
            "移動でなく蒸留",
            "その内容の行を追記先から消す",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, message)

    def test_backlog_below_threshold_stays_quiet(self):
        """T-011 3 行に満たない対象では統合を求めない"""
        repo = self.make_backlog_repo("skills/demo/SKILL.md", 2)
        output = self.run_hook(self.fresh_home(), "session-small", repo)
        message = self.message_from(output)
        with self.subTest("still asks for the append"):
            self.assertIn("additionalContext", output)
        with self.subTest("no integration clause"):
            self.assertNotIn("移動でなく蒸留", message)
        with self.subTest("does not name the target"):
            self.assertNotIn("skills/demo/SKILL.md", message)

    def test_backticks_survive_the_message(self):
        """T-012 統合の文言が zsh のコマンド置換で削られない"""
        repo = self.make_backlog_repo("skills/demo/SKILL.md", 4)
        message = self.run_message(self.fresh_home(), "session-quote", repo)
        # The prompt lives in a .md that textlint rewrites on every edit, so the instruction is
        # matched on its words rather than on the spacing around the path it names.
        for phrase in ("を先に書き、同じ内容を英語側へ反映する", ".ja/", "references/"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, message)


if __name__ == "__main__":
    unittest.main(verbosity=2)
