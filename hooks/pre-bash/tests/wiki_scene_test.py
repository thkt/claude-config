# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/pre-bash/wiki_scene.py (PreToolUse hook).

Runs the hook as a real subprocess, pinning the seam from a gh command line through to the
additionalContext it prints. Wiring into settings.json is out of scope (Manual verification
covers that, following hooks/pre-bash/tests/issue_body_gate_test.py's own note on the same
point).

Run: python3 hooks/pre-bash/tests/wiki_scene_test.py
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import override

HOOK = Path(__file__).resolve().parents[1] / "wiki_scene.py"

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_lib"))

import hook_harness  # noqa: E402

# One page per file keeps each fixture's declared pages exactly the ones a test names, so an
# assertion about "the issue-close pages" checks a closed, known set rather than whatever the
# real docs/wiki happens to carry that day.
ISSUE_CLOSE_PAGE = """---
globs: []
scenes: ["issue-close"]
---

# runtime-bug-wontfix
"""

SECOND_ISSUE_CLOSE_PAGE = """---
globs: []
scenes: ["issue-close"]
---

# umbrella-issue-recut
"""


def _field(node: object, *keys: str) -> str | None:
    """Walk a parsed JSON payload by key, returning None the moment the shape stops matching.

    isinstance narrows at each step, so the value arrives typed instead of Any.
    """
    for key in keys:
        if not isinstance(node, dict):
            return None
        node = node.get(key)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
    return node if isinstance(node, str) else None


class TestWikiScene(unittest.TestCase):
    # Declared here because setUp fills them: an attribute first seen inside a method
    # carries no type for a checker.
    tmpdir: tempfile.TemporaryDirectory[str]
    root: Path

    @override
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory(prefix="wiki-scene-")
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)

    def with_wiki(self, *, under: Path | None = None) -> Path:
        """A repository directory carrying docs/wiki/ with two pages tagged issue-close."""
        directory = under or Path(tempfile.mkdtemp(dir=self.root))
        wiki = directory / "docs" / "wiki"
        wiki.mkdir(parents=True)
        _ = (wiki / "runtime-bug-wontfix.md").write_text(ISSUE_CLOSE_PAGE, encoding="utf-8")
        _ = (wiki / "umbrella-issue-recut.md").write_text(
            SECOND_ISSUE_CLOSE_PAGE, encoding="utf-8"
        )
        return directory

    def run_hook(self, command: str, env: dict[str, str] | None = None) -> tuple[object, str]:
        payload = json.dumps(
            {"tool_name": "Bash", "tool_input": {"command": command}}, separators=(",", ":")
        )
        result = hook_harness.checked(HOOK, payload, env)
        stdout = result.stdout or ""
        try:
            out = json.loads(stdout) if stdout.strip() else None
        except json.JSONDecodeError:
            out = None
        return out, stdout

    def context_of(self, out: object) -> str:
        return _field(out, "hookSpecificOutput", "additionalContext") or ""

    def test_a_gh_issue_close_command_yields_an_additionalContext_naming_the_issue_close_pages(
        self,
    ) -> None:
        """T-009 A gh issue close command yields an additionalContext naming the issue-close pages"""
        directory = self.with_wiki()
        out, stdout = self.run_hook(f"cd {directory} && gh issue close 42")
        with self.subTest("parses as JSON"):
            self.assertIsNotNone(out, f"stdout does not parse: {stdout!r}")
        context = self.context_of(out)
        with self.subTest("names the first issue-close page"):
            self.assertIn("runtime-bug-wontfix.md", context)
        with self.subTest("names the second issue-close page"):
            self.assertIn("umbrella-issue-recut.md", context)

    def test_a_gh_issue_comment_command_yields_no_output(self) -> None:
        """T-010 A gh issue comment command yields no output"""
        directory = self.with_wiki()
        _, stdout = self.run_hook(f"cd {directory} && gh issue comment 42 --body hi")
        self.assertEqual(stdout.strip(), "")

    def test_a_cd_with_a_tilde_ahead_of_the_gh_command_resolves_to_the_expanded_repository(
        self,
    ) -> None:
        """T-011 A cd with a tilde ahead of the gh command resolves to the expanded repository"""
        # A `~` that reaches docs/wiki lookup unexpanded would resolve against cwd instead of
        # HOME, land on a directory named literally "~" that never exists, and this would come
        # back indistinguishable from T-012's no-docs/wiki case: both print nothing.
        home = Path(tempfile.mkdtemp(dir=self.root))
        self.with_wiki(under=home / "myrepo")
        out, stdout = self.run_hook(
            "cd ~/myrepo && gh issue close 42", env={"HOME": str(home), "PATH": "/usr/bin:/bin"}
        )
        with self.subTest("parses as JSON"):
            self.assertIsNotNone(out, f"stdout does not parse: {stdout!r}")
        with self.subTest("names a page from the expanded repository's wiki"):
            self.assertIn("runtime-bug-wontfix.md", self.context_of(out))

    def test_a_repository_without_docs_wiki_yields_no_output(self) -> None:
        """T-012 A repository without docs/wiki yields no output"""
        directory = Path(tempfile.mkdtemp(dir=self.root))
        _, stdout = self.run_hook(f"cd {directory} && gh issue close 42")
        self.assertEqual(stdout.strip(), "")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
