# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/lifecycle/reflection_ask.py (Stop hook).

HOME is overridden per test, which moves the whole cache (marks, sentinel, runs) into a fresh
directory. REFLECTION_ASK_CLAUDE points at a stub that prints its arguments, so a test run
never starts a real Claude Code session.

Run: python3 hooks/lifecycle/tests/reflection_ask_test.py
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import cast, override

HOOK = Path(__file__).resolve().parents[1] / "reflection_ask.py"
HERE = Path(__file__).resolve().parent
SPAWN_WAIT_SECONDS = 10.0


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
    stub: Path

    @override
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory(prefix="reflection_ask-test")
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)
        self.transcript = self.root / "transcript.jsonl"
        # The wrapper redirects the child's stdout into the run's log, so printing the arguments
        # rather than swallowing them makes that log the record of the invocation. The report
        # line follows because a run without one counts as failed.
        self.stub = self.root / "claude-stub"
        _ = self.stub.write_text(
            '#!/bin/sh\nprintf "%s\\n" "$@"\necho "追記 0 件、削除 0 件、統合 0 件"\n',
            encoding="utf-8",
        )
        self.stub.chmod(0o755)

    def fresh_home(self) -> Path:
        return Path(tempfile.mkdtemp(dir=self.root, prefix="home"))

    def cache(self, home: Path) -> Path:
        return home / ".cache" / "claude-reflection_ask"

    def run_dir(self, home: Path, session_id: str) -> Path:
        return self.cache(home) / "runs" / session_id

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
            env=dict(os.environ, HOME=str(home), REFLECTION_ASK_CLAUDE=str(self.stub)),
        )
        return result.stdout

    def prompt_of(self, home: Path, session_id: str) -> str:
        """The text handed to the child. Empty when no child was started."""
        prompt = self.run_dir(home, session_id) / "prompt.md"
        return prompt.read_text(encoding="utf-8") if prompt.is_file() else ""

    def wait_for_log(self, home: Path, session_id: str) -> str:
        """The child's log once the wrapper has appended its exit line.

        Polled rather than waited on: the spawn is detached on purpose, so this process holds
        no handle it could join.
        """
        log = self.run_dir(home, session_id) / "log.txt"
        deadline = time.monotonic() + SPAWN_WAIT_SECONDS
        while time.monotonic() < deadline:
            if log.is_file():
                body = log.read_text(encoding="utf-8", errors="replace")
                if "exit=" in body:
                    return body
            time.sleep(0.05)
        return log.read_text(encoding="utf-8", errors="replace") if log.is_file() else ""

    def run_prompt(
        self, home: Path, session_id: str = "test-session", cwd: Path | None = None
    ) -> str:
        _ = self.run_hook(home, session_id, cwd)
        return self.prompt_of(home, session_id)

    def test_second_call_in_same_session_starts_no_second_child(self) -> None:
        """T-001 A second call in the same session starts no second child"""
        home = self.fresh_home()
        with self.subTest("1st call starts a child"):
            _ = self.run_hook(home, "session-a")
            self.assertTrue(self.prompt_of(home, "session-a"), "no prompt was handed over")
        _ = self.wait_for_log(home, "session-a")
        first = (self.run_dir(home, "session-a") / "prompt.md").stat().st_mtime_ns
        with self.subTest("2nd call in the same session rewrites nothing"):
            _ = self.run_hook(home, "session-a")
            self.assertEqual(
                (self.run_dir(home, "session-a") / "prompt.md").stat().st_mtime_ns, first
            )

    def test_new_session_starts_a_child_and_prints_nothing(self) -> None:
        """T-002 A new session starts a child and the turn sees nothing"""
        home = self.fresh_home()
        _ = self.run_hook(home, "session-a")
        _ = self.wait_for_log(home, "session-a")
        output = self.run_hook(home, "session-b")
        with self.subTest("the child receives a prompt"):
            self.assertTrue(self.prompt_of(home, "session-b"))
        # Any output here lands back in the context detaching exists to spare.
        with self.subTest("the hook prints nothing on the success path"):
            self.assertEqual(output, "")

    def test_child_runs_detached_with_write_permission(self) -> None:
        """T-004 The child is launched detached, able to write, on a named model"""
        home = self.fresh_home()
        _ = self.run_hook(home, "session-spawn")
        log = self.wait_for_log(home, "session-spawn")
        for flag in ("--permission-mode", "bypassPermissions", "--model", "-p"):
            # A headless run that meets a permission prompt hangs rather than fails, so the
            # flags that keep it from prompting are pinned individually.
            with self.subTest(flag=flag):
                self.assertIn(flag, log)
        # The permission mode reaches the target by dropping the sensitive-file check, so the
        # narrowing has to come from the tool set instead.
        for tool in ("Bash", "Task", "Agent"):
            with self.subTest(denied=tool):
                self.assertIn(tool, log.split("--disallowedTools", 1)[-1])
        with self.subTest("the wrapper records the exit status"):
            self.assertIn("exit=0", log)
        # Asserted against the source because a detached spawn cannot be told from an attached
        # one by its output, and an attached child dies with the 10 second hook timeout.
        code = HOOK.read_text(encoding="utf-8")
        with self.subTest("the spawn detaches from the hook's process group"):
            self.assertIn("start_new_session=True", code)

    def test_a_running_child_blocks_a_second_spawn(self) -> None:
        """T-013 A sentinel from a running child blocks the next session's spawn"""
        home = self.fresh_home()
        cache = self.cache(home)
        cache.mkdir(parents=True)
        (cache / "spawning").touch()
        # The child runs this same hook under a fresh session_id, which the per-session mark
        # lets straight through.
        _ = self.run_hook(home, "session-blocked")
        self.assertEqual(self.prompt_of(home, "session-blocked"), "")

    def test_a_stale_sentinel_does_not_block(self) -> None:
        """T-014 A sentinel older than the window stops blocking"""
        home = self.fresh_home()
        cache = self.cache(home)
        cache.mkdir(parents=True)
        sentinel = cache / "spawning"
        sentinel.touch()
        stale = time.time() - 31 * 60
        os.utime(sentinel, (stale, stale))
        # A child killed before its cleanup leaves the sentinel behind, and without the window
        # that one death would switch reflection off with nothing to show for it.
        _ = self.run_hook(home, "session-stale")
        self.assertTrue(self.prompt_of(home, "session-stale"))

    def test_a_failed_run_is_reported_once(self) -> None:
        """T-015 A run that ended nonzero is reported to the terminal, and only once"""
        home = self.fresh_home()
        run = self.run_dir(home, "session-dead")
        run.mkdir(parents=True)
        _ = (run / "log.txt").write_text("boom\nexit=1\n", encoding="utf-8")
        output = self.run_hook(home, "session-next")
        parsed = cast(object, json.loads(output)) if output.strip() else None
        message = _field(parsed, "systemMessage") or ""
        with self.subTest("names the failure"):
            self.assertIn("失敗", message)
        # additionalContext would put the notice back in the context detaching exists to spare.
        with self.subTest("does not reach the model's context"):
            self.assertNotIn("additionalContext", output)
        with self.subTest("the same failure is not reported again"):
            self.assertNotIn("失敗", self.run_hook(home, "session-later"))

    def test_a_run_that_wrote_nothing_is_reported(self) -> None:
        """T-017 A run that ended at 0 without the report line is reported as a failure"""
        home = self.fresh_home()
        run = self.run_dir(home, "session-refused")
        run.mkdir(parents=True)
        # What a refused write actually leaves behind: the child explains itself and the CLI
        # still calls the run a success, so the exit code alone cannot tell the two apart.
        _ = (run / "log.txt").write_text(
            "Edit権限が拒否されました。書き込み許可をお願いします。\nexit=0\n", encoding="utf-8"
        )
        output = self.run_hook(home, "session-after")
        self.assertIn("失敗", output)

    def test_a_run_that_reported_is_not_flagged(self) -> None:
        """T-018 A run that closed with a count is left alone, however it spaced the line"""
        # Both forms observed from real children, along with a remark before the count.
        for i, report in enumerate(
            (
                "追記 1 件、削除 0 件、統合 0 件",
                "フォーマット済み。追記1件、削除0件、統合0件。",
            )
        ):
            home = self.fresh_home()
            run = self.run_dir(home, f"session-done-{i}")
            run.mkdir(parents=True)
            _ = (run / "log.txt").write_text(f"{report}\nexit=0\n", encoding="utf-8")
            with self.subTest(report=report):
                self.assertEqual(self.run_hook(home, f"session-after-{i}"), "")

    def test_a_run_older_than_the_window_is_pruned(self) -> None:
        """T-016 A run directory older than the mark window is removed"""
        home = self.fresh_home()
        old = self.run_dir(home, "session-ancient")
        old.mkdir(parents=True)
        _ = (old / "log.txt").write_text("exit=0\n", encoding="utf-8")
        stale = time.time() - 8 * 86400
        os.utime(old, (stale, stale))
        # runs/ holds a prompt and a whole reply per session and nothing else prunes it:
        # _claim's cleanup drops files by their own mtime and skips directories.
        _ = self.run_hook(home, "session-now")
        with self.subTest("the old run is gone"):
            self.assertFalse(old.exists())
        with self.subTest("the current run is kept"):
            self.assertTrue(self.prompt_of(home, "session-now"))

    def test_prompt_leaves_nothing_when_there_is_nothing(self) -> None:
        """T-003 The prompt asks for no entry when nothing is left to keep"""
        prompt = self.run_prompt(self.fresh_home())
        # One contiguous pattern rather than two halves: matched separately, a prompt that asks
        # for an entry when there is nothing and says 何も書かない elsewhere still passes.
        self.assertIn("残すものが無ければ何も書かない", prompt)

    def test_prompt_path_has_real_file(self) -> None:
        """T-005 The path in the prompt points at a real file"""
        prompt = self.run_prompt(self.fresh_home())
        found = re.search(r"/[A-Za-z0-9_./-]+/\.claude/rules/CORRECTIONS\.md", prompt)
        with self.subTest("names an absolute .claude/rules path"):
            self.assertIsNotNone(found, "names no absolute path")
        with self.subTest("the named path exists as a real file"):
            self.assertTrue(
                found and Path(found.group()).is_file(), "the named path holds no real file"
            )

    # An unresolved relative path lands the entry in whichever tree the caller happened to be in.
    def test_subdirectory_resolves_to_repository_root(self) -> None:
        """T-006 A cwd in a subdirectory still names the repository root"""
        repo_root = HERE.parents[2]
        prompt = self.run_prompt(self.fresh_home(), "session-subdir", HERE)
        self.assertIn(f"{repo_root}/.claude/rules/CORRECTIONS.md", prompt)

    def test_outside_a_repository_starts_no_child(self) -> None:
        """T-007 A cwd outside a repository starts no child"""
        outside = Path(tempfile.mkdtemp(dir=self.root, prefix="outside"))
        home = self.fresh_home()
        _ = self.run_hook(home, "session-outside", outside)
        self.assertEqual(self.prompt_of(home, "session-outside"), "")

    def test_the_child_is_told_to_write_it_itself(self) -> None:
        """T-008 The child is told to write the entry itself, not to delegate it"""
        prompt = self.run_prompt(self.fresh_home())
        for phrase in (
            # The child holds Read, Edit and Write and no Agent tool, so an instruction to
            # delegate leaves it waiting on a helper it cannot start.
            "あなた自身がこの 1 回で行う",
            str(self.transcript),
            # Naming the file alone leaves the creation of a missing .claude/rules to the
            # child's judgment.
            "追記先へ至るディレクトリが無ければ作り",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, prompt)
        with self.subTest("no instruction to hand the work to a subagent"):
            self.assertNotIn("subagent", prompt)

    def test_prompt_asks_for_tidying_in_the_same_pass(self) -> None:
        """T-009 Tidying is asked for in the same pass and the report is capped at one line"""
        prompt = self.run_prompt(self.fresh_home())
        for phrase in (
            "追記と掃除は、あなた自身がこの 1 回で行う",
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
            "「追記 N 件、削除 M 件、統合 K 件」の 1 行だけにする",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, prompt)

    # A repository built here rather than this one: the threshold reads the real backlog, so a
    # test against this repository would pass or fail on however many rows happen to be queued.
    def make_backlog_repo(self, target: str, rows: int) -> Path:
        repo = Path(tempfile.mkdtemp(dir=self.root, prefix="repo"))
        _ = subprocess.run(
            ["git", "-C", str(repo), "init", "-q"], check=False, capture_output=True
        )
        rules = repo / ".claude" / "rules"
        rules.mkdir(parents=True)
        body = [
            "# Corrections",
            "",
            "## 外部ツールの実測挙動",
            "",
            "| 訂正・知見 | 対象 |",
            "| --- | --- |",
        ]
        body += [f"| entry {i} | `{target}` |" for i in range(1, rows + 1)]
        _ = (rules / "CORRECTIONS.md").write_text("\n".join(body) + "\n", encoding="utf-8")
        return repo

    def test_backlog_at_threshold_asks_for_integration(self) -> None:
        """T-010 Three rows on one target ask for integration too"""
        repo = self.make_backlog_repo("skills/demo/SKILL.md", 3)
        prompt = self.run_prompt(self.fresh_home(), "session-backlog", repo)
        for phrase in (
            "skills/demo/SKILL.md",
            "3 行",
            # Distillation, not relocation: moving the cells verbatim reproduces the unreadable
            # table in the target file instead of turning the rows into a rule.
            "移動でなく蒸留",
            "その内容の行を追記先から消す",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, prompt)

    def test_backlog_below_threshold_stays_quiet(self) -> None:
        """T-011 A target short of three rows does not ask for integration"""
        repo = self.make_backlog_repo("skills/demo/SKILL.md", 2)
        home = self.fresh_home()
        prompt = self.run_prompt(home, "session-small", repo)
        with self.subTest("still asks for the append"):
            self.assertIn("残すものが無ければ何も書かない", prompt)
        with self.subTest("no integration clause"):
            self.assertNotIn("移動でなく蒸留", prompt)
        with self.subTest("does not name the target"):
            self.assertNotIn("skills/demo/SKILL.md", prompt)

    def test_integration_wording_survives_the_prompt(self) -> None:
        """T-012 The integration wording reaches the child intact"""
        repo = self.make_backlog_repo("skills/demo/SKILL.md", 4)
        prompt = self.run_prompt(self.fresh_home(), "session-quote", repo)
        # The prompt lives in a .md that textlint rewrites on every edit, so the instruction is
        # matched on its words rather than on the spacing around the path it names.
        for phrase in ("を先に書き、同じ内容を英語側へ反映する", ".ja/", "references/"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, prompt)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
