"""Seam tests pinning wiki_scene.py to what U-001/U-002 wrote into docs/wiki/ and to its own
registration in settings.json.

wiki_scene_test.py already pins the hook's own behaviour against fixture pages under a
temporary docs/wiki/. This file instead runs the hook against *this repository's* real
docs/wiki/ (T-013), and reads the real settings.json (T-014), so a page whose `scenes:`
frontmatter never reached find_wiki_rule.py, or a hook that runs standalone but was never
wired into PreToolUse, fails here even though every piece is green on its own.

Run: python3 hooks/pre-bash/tests/wiki_scene_seam_test.py
"""

import json
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "wiki_scene.py"
ROOT = Path(__file__).resolve().parents[3]
SETTINGS_JSON = ROOT / "settings.json"

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_lib"))

import hook_harness  # noqa: E402

# The docs/wiki/ pages this repository currently tags `scenes: ["issue-close"]`
# (skills/scribe/tests/skill_contract_test.py fixes this set; a page added or dropped there
# has to move here too). Listed exactly, not as a lower bound: T-013 checks the hook reports
# neither more nor fewer than the pages actually tagged.
ISSUE_CLOSE_PAGES = [
    "incident-driven-deferral.md",
    "premise-collapse-not-planned.md",
    "runtime-bug-wontfix.md",
    "umbrella-issue-recut.md",
    "untracked-output-manual-close.md",
]


def _field(node: object, *keys: str) -> str | None:
    """Walk a parsed JSON payload by key, returning None the moment the shape stops matching."""
    for key in keys:
        if not isinstance(node, dict):
            return None
        node = node.get(key)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
    return node if isinstance(node, str) else None


def _pretooluse_bash_commands(settings_text: str) -> list[str]:
    """The `command` of every hook registered under a PreToolUse group whose matcher is Bash."""
    settings = json.loads(settings_text)
    hooks = settings.get("hooks") if isinstance(settings, dict) else None
    pre_tool_use = hooks.get("PreToolUse") if isinstance(hooks, dict) else None
    commands: list[str] = []
    for group in pre_tool_use if isinstance(pre_tool_use, list) else []:
        if not isinstance(group, dict) or group.get("matcher") != "Bash":
            continue
        group_hooks = group.get("hooks")
        for entry in group_hooks if isinstance(group_hooks, list) else []:
            command = entry.get("command") if isinstance(entry, dict) else None
            if isinstance(command, str):
                commands.append(command)
    return commands


class TestWikiSceneRealWiki(unittest.TestCase):
    def run_hook(self, command: str) -> tuple[object, str]:
        payload = json.dumps(
            {"tool_name": "Bash", "tool_input": {"command": command}}, separators=(",", ":")
        )
        result = hook_harness.checked(HOOK, payload)
        stdout = result.stdout or ""
        try:
            out = json.loads(stdout) if stdout.strip() else None
        except json.JSONDecodeError:
            out = None
        return out, stdout

    def test_feeding_the_hook_entry_a_gh_issue_close_payload_for_this_repository_returns_the_five_issue_close_page_names(
        self,
    ) -> None:
        """T-013 Feeding the hook entry a gh issue close payload for this repository returns
        the five issue-close page names"""
        # `cd` to ROOT rather than relying on the test runner's own cwd: wiki_scene.find()
        # resolves docs/wiki/ off the command's directory, not off wherever python3 started.
        out, stdout = self.run_hook(f"cd {ROOT} && gh issue close 42")
        with self.subTest("parses as JSON"):
            self.assertIsNotNone(out, f"stdout does not parse: {stdout!r}")
        context = _field(out, "hookSpecificOutput", "additionalContext") or ""
        listed = sorted(
            line.removeprefix("- ").strip()
            for line in context.splitlines()
            if line.startswith("- ")
        )
        self.assertEqual(
            listed,
            sorted(ISSUE_CLOSE_PAGES),
            f"expected exactly the issue-close pages, got: {context!r}",
        )


class TestWikiSceneRegistration(unittest.TestCase):
    def test_settings_json_registers_wiki_scene_py_under_the_pretooluse_bash_matcher(
        self,
    ) -> None:
        """T-014 settings.json registers wiki_scene.py under the PreToolUse Bash matcher"""
        commands = _pretooluse_bash_commands(SETTINGS_JSON.read_text(encoding="utf-8"))
        self.assertIn(
            "~/.claude/hooks/pre-bash/wiki_scene.py",
            commands,
            f"wiki_scene.py is not registered under PreToolUse:Bash, found: {commands!r}",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
