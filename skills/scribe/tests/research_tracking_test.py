"""Tests that .claude/workspace/research/ is git-tracked while .claude/workspace/planning/
stays ignored, per .gitignore.

Run: python3 skills/scribe/tests/research_tracking_test.py
"""

import subprocess
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def check_ignore(path: Path) -> int:
    """git check-ignore's exit code for path: 0 when ignored, 1 when not ignored."""
    proc = subprocess.run(
        ["git", "-C", str(ROOT), "check-ignore", str(path.relative_to(ROOT))],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode


class ResearchTracking(unittest.TestCase):
    def test_git_check_ignore_exits_nonzero_for_a_markdown_file_under_claude_workspace_research(
        self,
    ) -> None:
        """T-001 git check-ignore exits nonzero for a markdown file under
        .claude/workspace/research"""
        research = ROOT / ".claude" / "workspace" / "research"
        target = sorted(research.glob("*.md"))[0]
        self.assertNotEqual(check_ignore(target), 0, f"{target} is still git-ignored")

    def test_a_non_markdown_file_under_research_stays_ignored(self) -> None:
        """SKILL.md Phase 2 step 4 reads *.md only, so a tracked non-md file would be
        published without ever being scanned."""
        target = ROOT / ".claude" / "workspace" / "research" / "scratch.json"
        self.assertEqual(check_ignore(target), 0, f"{target} is not git-ignored")

    def test_git_check_ignore_keeps_ignoring_a_file_under_claude_workspace_planning(
        self,
    ) -> None:
        """T-002 git check-ignore keeps ignoring a file under .claude/workspace/planning"""
        planning = ROOT / ".claude" / "workspace" / "planning"
        target = sorted(planning.glob("*.md"))[0]
        self.assertEqual(check_ignore(target), 0, f"{target} is no longer git-ignored")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
