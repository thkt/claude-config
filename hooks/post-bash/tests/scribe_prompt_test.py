# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/post-bash/scribe_prompt.py (PostToolUse hook).

This is the seam between hooks/_lib/scribe_trigger.py's find/should_prompt (U-001..U-003,
already unit-tested in hooks/_lib/tests/scribe_trigger_test.py) and a real Bash PostToolUse
payload. What only the hook wiring can break is whether the trigger a command line carries
actually reaches scribe_trigger, whether should_prompt's verdict actually reaches stdout in
the shape hooks/_lib/mirror_prose.py's emit() establishes, and whether a failed
tool_response actually short-circuits it before should_prompt runs at all. The hook runs as
a real subprocess against the real scribe_trigger module; only gh, the external system
should_prompt calls out to, is stubbed.

The Bash tool's PostToolUse tool_response is `{stdout, stderr, interrupted, isImage}`
(https://code.claude.com/docs/en/hooks#posttooluse-decision-control, the updatedToolOutput
example that documents "the Bash tool's output shape") -- there is no separate exit-code or
success field. `interrupted` is the only boolean that shape carries, and the same reference
states that cancelling a running Bash call still reaches PostToolUse rather than
PostToolUseFailure, with "the tool result carr[ying] the interruption message instead". This
suite reads `interrupted: true` as the "tool_response indicates failure" case the contract
names; a future implementer reading a different signal should update this comment along with
the fixtures below.

Run: python3 hooks/post-bash/tests/scribe_prompt_test.py
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from typing import override

HOOK = Path(__file__).resolve().parents[1] / "scribe_prompt.py"
SETTINGS = Path(__file__).resolve().parents[3] / "settings.json"

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_lib"))

import hook_harness  # noqa: E402

# should_prompt's three gh calls in the order hooks/_lib/scribe_trigger.py makes them: the
# unmerged-PR check, the last-scribe-merge cursor, then the new-input count. Values match
# hooks/_lib/tests/scribe_trigger_test.py's "促す" case (test_未マージ_0_件_入力_1_件以上_stamp_が_cooldown_外のとき促す)
# so a drift between the two suites would show up as one of them alone going red.
PROMPTING_GH_RESPONSES = ["[]", "", '[{"number": 5}]']

# A fake `gh` that pops one canned response per invocation, in call order. gh is the only
# external system should_prompt reaches out to, so this is what stays faked while
# scribe_trigger and the hook itself run for real.
GH_STUB = """#!/usr/bin/env python3
import os
import pathlib
import sys

responses = pathlib.Path(os.environ["GH_STUB_RESPONSES"]).read_text(encoding="utf-8").split("\\n")
index_path = pathlib.Path(os.environ["GH_STUB_INDEX"])
i = int(index_path.read_text()) if index_path.is_file() else 0
index_path.write_text(str(i + 1))
sys.stdout.write(responses[i])
"""


class TestScribePrompt(unittest.TestCase):
    tmpdir: tempfile.TemporaryDirectory[str]
    root: Path

    @override
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory(prefix="scribe-prompt-tests-")
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)

    def gh_stub_dir(self, responses: list[str]) -> tuple[Path, dict[str, str]]:
        """A directory holding the fake `gh`, plus the env vars it reads its queue from.
        `CLAUDE_GH_BIN` points the hook at this stub: scribe_trigger resolves gh by absolute
        path, since a hook starts with PATH cut down and a bare name would not resolve."""
        stub_dir = self.root / "gh-stub"
        stub_dir.mkdir()
        stub = stub_dir / "gh"
        _ = stub.write_text(GH_STUB, encoding="utf-8")
        stub.chmod(0o755)
        responses_file = stub_dir / "responses"
        _ = responses_file.write_text("\n".join(responses), encoding="utf-8")
        return stub_dir, {
            "CLAUDE_GH_BIN": str(stub),
            "GH_STUB_RESPONSES": str(responses_file),
            "GH_STUB_INDEX": str(stub_dir / "index"),
        }

    def run_hook(
        self,
        command: str,
        *,
        interrupted: bool = False,
        gh_responses: list[str] | None = None,
    ) -> str:
        """Run the hook on a Bash PostToolUse payload for `command`.

        HOME moves to a fresh temp dir so should_prompt's cooldown stamp
        (~/.cache/claude-scribe_trigger.last) never touches this machine's real one, the same
        isolation hooks/lifecycle/tests/recall_index_test.py uses for its own stamp file.

        gh_responses is None on every path where should_prompt is expected to return before
        it ever calls gh (no docs/wiki, or the tool_response-failure short-circuit): PATH
        then carries no `gh` at all, so an implementation bug that reaches gh anyway fails
        fast on "not found" instead of making a real network call.
        """
        home = self.root / "home"
        home.mkdir(exist_ok=True)
        env = dict(os.environ, HOME=str(home))
        if gh_responses is not None:
            stub_dir, gh_env = self.gh_stub_dir(gh_responses)
            env["PATH"] = f"{stub_dir}{os.pathsep}{env['PATH']}"
            env.update(gh_env)
        else:
            env["PATH"] = str(self.root)
        payload = {
            "hook_event_name": "PostToolUse",
            "tool_name": "Bash",
            "tool_input": {"command": command},
            "tool_response": {
                "stdout": "",
                "stderr": "",
                "interrupted": interrupted,
                "isImage": False,
            },
        }
        return hook_harness.run(HOOK, payload, env)

    def test_prompting_decided_puts_scribe_in_additional_context(self) -> None:
        """T-012 促すと決まったとき `hookSpecificOutput.additionalContext` に `/scribe` を含む本文が出る"""
        directory = self.root / "target-prompt"
        (directory / "docs" / "wiki").mkdir(parents=True)
        stdout = self.run_hook(f"cd {directory}; git pull", gh_responses=PROMPTING_GH_RESPONSES)
        payload = json.loads(stdout)
        context = payload["hookSpecificOutput"]["additionalContext"]
        self.assertIn("/scribe", context)

    def test_not_prompting_decided_stdout_is_empty(self) -> None:
        """T-013 促さないと決まったとき stdout が空になる"""
        # No docs/wiki under the target: should_prompt's first gate returns False before it
        # ever calls gh (hooks/_lib/scribe_trigger.py's should_prompt docstring).
        directory = self.root / "target-no-wiki"
        directory.mkdir()
        stdout = self.run_hook(f"cd {directory}; git pull")
        self.assertEqual(stdout, "")

    def test_failed_tool_response_does_not_prompt(self) -> None:
        """T-014 `tool_response` が失敗を示すとき促さない"""
        # docs/wiki is present here, unlike T-013: the only thing that can stop a prompt on
        # this fixture is the tool_response check itself, not should_prompt's own gates.
        directory = self.root / "target-interrupted"
        (directory / "docs" / "wiki").mkdir(parents=True)
        stdout = self.run_hook(f"cd {directory}; git pull", interrupted=True)
        self.assertEqual(stdout, "")

    def test_the_hook_file_is_executable(self) -> None:
        """settings.json runs the path directly, so a hook without the bit never starts and
        the miss shows up as nothing happening rather than as an error."""
        self.assertTrue(os.access(HOOK, os.X_OK), f"{HOOK} に実行権限が無い")

    def test_settings_json_registers_hook_under_posttooluse_bash(self) -> None:
        """T-015 `settings.json` の `PostToolUse` の `Bash` matcher にこの hook が載っている

        `.gitignore` が `/settings.json` を持つので CI のチェックアウトには無い。配線が
        効くのは各自の手元だけなので、そこでだけ検査する。
        """
        if not SETTINGS.is_file():
            self.skipTest("settings.json は追跡外で、このチェックアウトには無い")
        settings = json.loads(SETTINGS.read_text(encoding="utf-8"))
        bash_entries = [
            entry for entry in settings["hooks"]["PostToolUse"] if entry.get("matcher") == "Bash"
        ]
        commands = [
            hook.get("command", "") for entry in bash_entries for hook in entry.get("hooks", [])
        ]
        self.assertTrue(
            any("post-bash/scribe_prompt.py" in command for command in commands),
            f"post-bash/scribe_prompt.py が settings.json の PostToolUse/Bash に無い: {commands}",
        )


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
