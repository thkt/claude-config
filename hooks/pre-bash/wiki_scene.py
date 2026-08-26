#!/usr/bin/env python3
"""PreToolUse hook: name the docs/wiki pages scoped to a gh command about to run.

A page's frontmatter can declare a `scenes` entry (skills/scribe/scripts/find_wiki_rule.py),
naming a situation such as issuing a `gh issue close` rather than a file glob. This hook is
where that declaration reaches the agent: it recognises the situation from the command line
and surfaces the pages find_wiki_rule.py already knows how to select for it.

Advisory. The pages ride back through hook_payload.notify, the same output helper
scribe_prompt.py uses, so the decision is always allow and the call never stops on this.
Called with hook_event_name="PreToolUse", since notify's default names the event
scribe_prompt.py fires on instead of this one.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this file loadable there.
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

import command_scan
from hook_payload import field, notify, parse

ROOT = Path(__file__).resolve().parents[2]
FIND_WIKI_RULE = ROOT / "skills" / "scribe" / "scripts" / "find_wiki_rule.py"

# The command prefixes this hook recognises, each paired with the scene find_wiki_rule.py
# selects docs/wiki pages by. command_scan.starts_with reads position, not word presence, so
# `git commit -m "gh issue close 42"` never matches: "gh" sits inside a message argument, not
# at the position a command name occupies.
SCENE_COMMANDS: list[tuple[list[str], str]] = [
    (["gh", "issue", "create"], "issue-create"),
    (["gh", "pr", "create"], "pr-create"),
    (["gh", "issue", "close"], "issue-close"),
]


def find(command: str) -> tuple[Path, str] | None:
    """The (repository directory, scene) a gh command names, or None when the line names
    neither.

    `directory` follows every cd ahead of the command, the way scribe_trigger.find follows a
    cd ahead of `git pull`: the docs/wiki a scene's pages are read from is the one the command
    itself runs in, not wherever the hook process started.
    """
    directory = Path.cwd()
    for tokens in command_scan.commands(command):
        if tokens[0] == "cd" and len(tokens) > 1:
            # `cd ~/myrepo` is what the shell expands, not a directory named `~`.
            directory = directory / Path(tokens[1]).expanduser()
            continue
        for prefix, scene in SCENE_COMMANDS:
            if command_scan.starts_with(tokens, prefix):
                return directory, scene
    return None


def _scene_pages(directory: Path, scene: str) -> list[str]:
    """The docs/wiki pages find_wiki_rule.py selects for scene, empty when the repository
    carries no docs/wiki or none of its pages declare the scene.

    Run as a subprocess rather than imported, the same boundary issue_body_gate.py keeps
    between hooks/ and skills/*/scripts/: find_wiki_rule.py is that skill's own CLI, and a
    direct import would read its internals as this hook's API instead.
    """
    wiki_dir = directory / "docs" / "wiki"
    if not wiki_dir.is_dir():
        return []
    result = subprocess.run(
        [sys.executable, str(FIND_WIKI_RULE), str(wiki_dir), "", "--scene", scene],
        stdout=subprocess.PIPE,
        text=True,
        check=False,
    )
    # A non-zero exit means find_wiki_rule.py rejected --scene: no page under wiki_dir
    # declares it, which reads the same as "no pages" here rather than as a hook error.
    pages = parse(result.stdout).get("scenes")
    return [str(page) for page in pages] if isinstance(pages, list) else []


def main() -> None:
    payload = parse(sys.stdin.read())
    command = field(field(payload, "tool_input"), "command")
    if not isinstance(command, str) or not command:
        return
    try:
        found = find(command)
    except ValueError:
        # command_scan raises on a line shlex cannot close, and letting it out would report a
        # hook error on an ordinary command.
        return
    if found is None:
        return
    directory, scene = found
    pages = _scene_pages(directory, scene)
    if not pages:
        return
    listing = "\n".join(f"- {page}" for page in pages)
    notify(
        f"wiki_scene: {scene} に該当する docs/wiki ページがある。\n{listing}",
        hook_event_name="PreToolUse",
    )


if __name__ == "__main__":
    main()
