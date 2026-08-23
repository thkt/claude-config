"""Integration tests for hooks/security/rm_to_trash.py (PreToolUse hook).

Run: python3 hooks/security/tests/rm_to_trash_test.py
"""

import json
import subprocess
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "rm_to_trash.py"

sys.path.insert(0, str(HOOK.parents[1] / "_lib"))
sys.path.insert(0, str(HOOK.parent))

import rm_to_trash  # noqa: E402


def run_hook(command: str) -> str:
    """The hook's stdout, after confirming it ran.

    A hook that dies before writing anything returns an empty string, which every
    "is not a deny" assertion accepts.
    """
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    result = subprocess.run(
        [sys.executable, str(HOOK)],
        input=payload,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(f"hook exited {result.returncode}: {result.stderr.strip()}")
    return result.stdout


class TestRmToTrash(unittest.TestCase):
    # One subTest per command. Without it the first failure skips the rest, leaving only
    # one of them visible as passed or denied.
    def assert_denied(self, command: str) -> None:
        with self.subTest(command=command):
            self.assertIn('"deny"', run_hook(command), "does not deny")

    def assert_allowed(self, command: str) -> None:
        with self.subTest(command=command):
            self.assertNotIn('"deny"', run_hook(command), "denies")

    def test_direct_deletion(self) -> None:
        """T-001 A deletion at the head of the command is denied"""
        self.assert_denied("rm -rf /tmp/x")
        self.assert_denied("rmdir /tmp/x")
        self.assert_denied("unlink /tmp/x")
        self.assert_denied("shred /tmp/x")

    def test_second_line_deletion(self) -> None:
        """T-002 A deletion on a later line is denied too"""
        self.assert_denied("cd /tmp\nrm -rf x")

    def test_wrapped_deletion(self) -> None:
        """T-003 A deletion behind a wrapper word is denied too"""
        self.assert_denied("sudo rm -rf /tmp/x")
        self.assert_denied("env rm /tmp/x")
        self.assert_denied("time rm -rf /tmp/x")
        self.assert_denied("/bin/rm -rf /tmp/x")

    def test_indirect_deletion(self) -> None:
        """T-004 A deletion through find or xargs is denied too"""
        self.assert_denied('find . -name "*.tmp" -exec rm {} \\;')
        self.assert_denied("find . -print0 | xargs -0 rm")

    def test_quoted_text_is_not_a_deletion(self) -> None:
        """T-005 A word inside quotes does not count as a deletion"""
        self.assert_allowed("sed -i '' 's|rm -rf x|y|g' f")
        self.assert_allowed("git commit -m 'remove rm calls from the test'")
        self.assert_allowed("echo 'rm -rf danger' > note.txt")

    def test_heredoc_body_is_not_a_deletion(self) -> None:
        """T-006 A deletion verb in a heredoc body does not deny"""
        self.assert_allowed(
            "cat > /tmp/m.txt << 'EOF'\nrm -rf /tmp/x\nEOF\ngit commit -F /tmp/m.txt"
        )

    def test_unparsable_input_is_denied(self) -> None:
        """T-007 A command that cannot be parsed falls to deny"""
        # An unterminated quote leaves no way to tell where the command position is. This is
        # a security hook, so what it cannot decide it does not let through.
        self.assert_denied('rm -rf "/tmp/x')

    def test_unrelated_command_skipped(self) -> None:
        """T-008 A command with no deletion verb returns nothing"""
        self.assertEqual(run_hook("git status"), "")

    def test_deletion_through_a_flag(self) -> None:
        """T-009 A form that unlinks files without naming a deletion is denied"""
        # In find -delete and git clean alike, no token on the line names a deletion command.
        self.assert_denied('find . -name "*.tmp" -delete')
        self.assert_denied("git clean -fd")
        self.assert_denied("git -C /tmp clean -fd")

    def test_listing_is_not_a_deletion(self) -> None:
        """T-010 A form that only lists, without deleting, is allowed"""
        self.assert_allowed("git clean -n")
        self.assert_allowed("git clean -nd")
        self.assert_allowed("git clean --dry-run")
        self.assert_allowed('find . -name "*.tmp"')

    def test_env_assignment_does_not_hide_a_deletion(self) -> None:
        """T-011 A leading environment assignment does not hide a deletion"""
        # Reading the assignment as the command name misses rm, and the deletion runs.
        self.assert_denied("FOO=1 rm -rf /tmp/x")
        self.assert_denied("FOO=1 BAR=2 rm -rf /tmp/x")


class TestPrefilterCoversEveryVerb(unittest.TestCase):
    """main()'s TRIGGERS prefilter answers "is this a deletion" ahead of kind(), so a verb it
    does not match returns before the scan and is never denied. VERBS is read off the module
    rather than hard-coded, so a verb added there needs no edit here."""

    def test_every_deletion_verb_is_denied(self) -> None:
        """T-012 Every VERBS member reaches a denial through the prefilter"""
        for verb in sorted(rm_to_trash.VERBS):
            with self.subTest(verb=verb):
                self.assertIn("deny", run_hook(f"{verb} /tmp/x"))


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
