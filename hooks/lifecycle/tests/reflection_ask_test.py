# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/lifecycle/reflection_ask.py (Stop hook).

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
from typing import cast, override

HOOK = Path(__file__).resolve().parents[1] / "reflection_ask.py"
HERE = Path(__file__).resolve().parent


def _field(node: object, *keys: str) -> str | None:
    """Walk a parsed JSON payload by key, returning None the moment the shape stops matching.

    isinstance narrows at each step, so the value arrives typed instead of Any.
    """
    for key in keys:
        if not isinstance(node, dict):
            return None
        node = node.get(key)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
    return node if isinstance(node, str) else None


class TestReflectionAsk(unittest.TestCase):
    # Declared here because setUp fills them: an attribute first seen inside a method
    # carries no type for a checker.
    tmpdir: tempfile.TemporaryDirectory[str]
    root: Path
    transcript: Path

    @override
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory(prefix="reflection_ask-test")
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)
        self.transcript = self.root / "transcript.jsonl"

    def fresh_home(self) -> Path:
        return Path(tempfile.mkdtemp(dir=self.root, prefix="home"))

    # cwd defaults to this test directory, so the default path exercises the root resolution
    # rather than a lucky top-level run.
    def run_hook(
        self, home: Path, session_id: str = "test-session", cwd: Path | None = None
    ) -> str:
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

    def message_from(self, output: str) -> str:
        if not output.strip():
            return ""
        try:
            parsed = cast(object, json.loads(output))
            return _field(parsed, "hookSpecificOutput", "additionalContext") or ""
        except json.JSONDecodeError:
            return ""

    def run_message(
        self, home: Path, session_id: str = "test-session", cwd: Path | None = None
    ) -> str:
        return self.message_from(self.run_hook(home, session_id, cwd))

    def test_second_call_in_same_session_is_silent(self) -> None:
        """T-001 A second call in the same session returns nothing"""
        home = self.fresh_home()
        with self.subTest("1st call returns an additionalContext"):
            self.assertIn('"additionalContext"', self.run_hook(home, "session-a"))
        with self.subTest("2nd call in the same session returns nothing"):
            self.assertEqual(self.run_hook(home, "session-a"), "")

    def test_new_session_returns_additionalContext(self):
        """T-002 A new session returns an additionalContext and prints nothing"""
        home = self.fresh_home()
        _ = self.run_hook(home, "session-a")
        output = self.run_hook(home, "session-b")
        with self.subTest("additionalContext key present"):
            self.assertIn('"additionalContext"', output)
        # The instruction addresses the agent, so a systemMessage would print the same 700
        # characters into the terminal and bury the turn's own answer.
        with self.subTest("no systemMessage key"):
            self.assertNotIn('"systemMessage"', output)

    def test_question_leaves_nothing_when_there_is_nothing(self) -> None:
        """T-003 The question asks for no entry when nothing is left to keep"""
        message = self.run_message(self.fresh_home())
        # One contiguous pattern rather than two halves: matched separately, a prompt that asks
        # for an entry when there is nothing and says 何も書かない elsewhere still passes.
        self.assertIn("残すものが無ければ何も書かない", message)

    def test_additionalcontext_path_has_real_file(self) -> None:
        """T-005 The path in additionalContext points at a real file"""
        message = self.run_message(self.fresh_home())
        found = re.search(r"/[A-Za-z0-9_./-]+/\.claude/rules/CORRECTIONS\.md", message)
        with self.subTest("names an absolute .claude/rules path"):
            self.assertIsNotNone(found, "names no absolute path")
        with self.subTest("the named path exists as a real file"):
            self.assertTrue(found and Path(found.group()).is_file(), "the named path holds no real file")

    # An unresolved relative path lands the entry in whichever tree the caller happened to be in.
    def test_subdirectory_resolves_to_repository_root(self) -> None:
        """T-006 A cwd in a subdirectory still names the repository root"""
        repo_root = HERE.parents[2]
        message = self.run_message(self.fresh_home(), "session-subdir", HERE)
        self.assertIn(f"{repo_root}/.claude/rules/CORRECTIONS.md", message)

    def test_outside_a_repository_is_silent(self) -> None:
        """T-007 A cwd outside a repository returns nothing"""
        outside = Path(tempfile.mkdtemp(dir=self.root, prefix="outside"))
        self.assertEqual(self.run_hook(self.fresh_home(), "session-outside", outside), "")

    def test_write_is_delegated_to_a_subagent(self) -> None:
        """T-008 The write is delegated to a subagent and the caller writes nothing"""
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

    def test_question_asks_for_tidying_in_the_same_pass(self) -> None:
        """T-009 Tidying is asked for in the same pass and the report is capped at one line"""
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

    def test_script_never_launches_claude(self) -> None:
        """T-004 The script holds no line that launches claude"""
        with self.subTest("hook script exists"):
            self.assertTrue(HOOK.is_file() and HOOK.stat().st_size, "the hook is missing")
        # Invocation forms, not the bare word: the session record is named
        # claude-reflection_ask.session, which the word alone would hit.
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
    def make_backlog_repo(self, target: str, rows: int) -> Path:
        repo = Path(tempfile.mkdtemp(dir=self.root, prefix="repo"))
        _ = subprocess.run(["git", "-C", str(repo), "init", "-q"], check=False, capture_output=True)
        rules = repo / ".claude" / "rules"
        rules.mkdir(parents=True)
        body = ["# Corrections", "", "## 外部ツールの実測挙動", "", "| 訂正・知見 | 対象 |", "| --- | --- |"]
        body += [f"| entry {i} | `{target}` |" for i in range(1, rows + 1)]
        _ = (rules / "CORRECTIONS.md").write_text("\n".join(body) + "\n", encoding="utf-8")
        return repo

    def test_backlog_at_threshold_asks_for_integration(self) -> None:
        """T-010 Three rows on one target ask for integration too"""
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

    def test_backlog_below_threshold_stays_quiet(self) -> None:
        """T-011 A target short of three rows does not ask for integration"""
        repo = self.make_backlog_repo("skills/demo/SKILL.md", 2)
        output = self.run_hook(self.fresh_home(), "session-small", repo)
        message = self.message_from(output)
        with self.subTest("still asks for the append"):
            self.assertIn("additionalContext", output)
        with self.subTest("no integration clause"):
            self.assertNotIn("移動でなく蒸留", message)
        with self.subTest("does not name the target"):
            self.assertNotIn("skills/demo/SKILL.md", message)

    def test_backticks_survive_the_message(self) -> None:
        """T-012 The integration wording survives zsh command substitution"""
        repo = self.make_backlog_repo("skills/demo/SKILL.md", 4)
        message = self.run_message(self.fresh_home(), "session-quote", repo)
        # The prompt lives in a .md that textlint rewrites on every edit, so the instruction is
        # matched on its words rather than on the spacing around the path it names.
        for phrase in ("を先に書き、同じ内容を英語側へ反映する", ".ja/", "references/"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, message)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
