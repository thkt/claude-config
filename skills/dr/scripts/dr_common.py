"""Shared helpers for the dr skill scripts."""

import os
import re
import subprocess
import sys
from pathlib import Path
from typing import NoReturn


def fail(*lines: str) -> NoReturn:
    print(*lines, sep="\n", file=sys.stderr)
    sys.exit(1)


def resolve_dr_dir(arg: str | None = None) -> Path:
    """DR_DIR env > arg > <git-root>/docs/decisions."""
    if os.environ.get("DR_DIR"):
        return Path(os.environ["DR_DIR"])
    if arg:
        return Path(arg)
    git = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if git.returncode != 0:
        fail(
            "Error: not inside a git repository. Decision Records require"
            + " <git-root>/docs/decisions/. Set DR_DIR env var to override."
        )
    return Path(git.stdout.strip()) / "docs" / "decisions"


def guard_skill_dir(dr_dir: Path, hint: str) -> None:
    """Reject the skill-definition directory itself as a Decision Record archive."""
    if (dr_dir / "SKILL.md").is_file():
        fail(
            f"Error: {dr_dir} contains SKILL.md (skill-definition directory,"
            + " not a Decision Record archive)",
            hint,
        )


def split_frontmatter(text: str) -> tuple[list[str], list[str]]:
    """(frontmatter lines, body lines).

    Frontmatter only when the file opens with a --- line and has a closing ---
    line. A --- elsewhere (e.g. a body horizontal rule) is never a delimiter, and
    an unclosed opening --- yields no frontmatter.
    """
    lines = text.splitlines()
    fence = re.compile(r"^---[ \t]*$")
    if not lines or not fence.match(lines[0]):
        return [], lines
    for i in range(1, len(lines)):
        if fence.match(lines[i]):
            return lines[1:i], lines[i + 1 :]
    return [], lines
