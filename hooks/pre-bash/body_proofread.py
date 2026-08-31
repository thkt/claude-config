#!/opt/homebrew/bin/python3
"""PreToolUse hook: proofread the body a gh filing or a commit is about to write.

Advisory. The findings ride back as additionalContext and never stop the call, since a
proofreading verdict is the author's to weigh.

Failure mode: fail-closed. Quoting the scan cannot split is the one failure it swallows, and
that hides where the body sits rather than breaking the hook.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this module loadable there.
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import TYPE_CHECKING, NamedTuple

# The heavy ones are imported where they are used, not here: this hook fires for every Bash
# call and turns most of them away in main's first check. `json` stays up here because
# deferring it buys nothing measurable.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

if TYPE_CHECKING:
    import gh_filing

HEREDOC = r"<<-?\s*(['\"]?)(\w+)\1"


class Mode(NamedTuple):
    label: str
    threshold: int | None
    checklist: bool


FILING = Mode("body", None, checklist=True)
# The checklist asks about an issue's readers, which a commit message has none of.
COMMIT = Mode("commit message", 10, checklist=False)

# git commit spells these its own way, and `-F` names --file here where it names --body-file
# on a gh filing.
COMMIT_INLINE = ("-m", "--message")
COMMIT_FILE = ("-F", "--file")


def _checklist() -> str:
    """The structure questions, read from the sibling .md.

    They live there so they read as prose and textlint reaches them, which it cannot do for a
    string inside this file. Read from the first level-2 heading down, since the lines above it
    describe the file to whoever edits it rather than to whoever receives the questions.

    Empty when the file is gone: the proofreading still has something to say, and a checklist
    nobody can read adds nothing to it.
    """
    try:
        body = Path(__file__).with_suffix(".md").read_text(encoding="utf-8")
    except OSError:
        return ""
    _, heading, section = body.partition("\n## ")
    return f"## {section}".strip() if heading else ""


def _target(command: str) -> tuple[Mode, str] | None:
    """What the command line is about to write, paired with how to label it.

    Read from tokens rather than from the raw string: a commit message that mentions
    `gh issue create` would otherwise be taken for a filing, and the body would be looked for
    in a filing that is not there, so the message reaches no one unproofread.
    """
    import command_scan
    import gh_filing

    try:
        filing = gh_filing.find(command)
        if filing is not None:
            body = _filing_body(filing)
            return (FILING, body) if body else None
        for tokens in command_scan.commands(command):
            if tokens[0] == "git" and command_scan.git_subcommand(tokens)[0] == "commit":
                body = _commit_body(command, tokens)
                return (COMMIT, body) if body else None
    except ValueError:
        return None  # an unclosed quote hides which command the line runs
    return None


def _heredoc_body(text: str) -> str | None:
    """The body of the first heredoc, or None when its marker never closes."""
    import re

    match = re.search(HEREDOC, text)
    if not match:
        return None
    lines = text.split("\n")
    for index, line in enumerate(lines):
        if match.group(0) not in line:
            continue
        body: list[str] = []
        for following in lines[index + 1 :]:
            if following.strip() == match.group(2):
                return "\n".join(body)
            body.append(following)
    return None


def _flag(tokens: list[str], names: tuple[str, ...]) -> str | None:
    import command_scan

    for name in names:
        value = command_scan.flag_value(tokens, name)
        if value:
            return value
    return None


def _read(target: Path) -> str | None:
    if not target.is_file():
        return None
    return target.read_text(encoding="utf-8", errors="replace")


def _filing_body(filing: gh_filing.Filing) -> str | None:
    """The body a gh filing is about to write. A filing names its body through a flag, so a
    heredoc on the same line is writing some other file, and reading it would proofread that
    file under the issue's name."""
    import gh_filing

    inline = gh_filing.flag(filing, gh_filing.BODY_FLAGS)
    if inline is not None:
        return inline
    target = gh_filing.body_file(filing)
    return _read(target) if target is not None else None


def _commit_body(command: str, tokens: list[str]) -> str | None:
    """The message a commit is about to write. Its heredoc body is the message itself, and it
    arrives as the value of an inline flag as well, so it is read before any flag."""
    body = _heredoc_body(command)
    if body is not None:
        return body
    inline = _flag(tokens, COMMIT_INLINE)
    if inline is not None:
        return inline
    path = _flag(tokens, COMMIT_FILE)
    if path is None:
        return None
    # A relative path stays unread: a commit carries no cd this hook can follow the way a
    # filing does, so the shell state that would resolve it is not on the command line.
    target = Path(path)
    return _read(target) if target.is_absolute() else None


def _lint_section(body: str, mode: Mode) -> str:
    import tempfile

    import textlint
    from japanese import has_japanese

    if not has_japanese(body, mode.threshold):
        return ""
    with tempfile.TemporaryDirectory() as tmpdir:
        target = Path(tmpdir) / "body.md"
        _ = target.write_text(body + "\n", encoding="utf-8")
        output = textlint.lint(str(target))
        if not output.strip():
            return ""
        label = mode.label
        # textlint prints the path on its own line above the findings, and repeats it inside
        # each one. Neither reaches a reader who never saw the temp file.
        kept = [line for line in output.splitlines() if line.strip() != str(target)]
        findings = "\n".join(line.replace(str(target), label) for line in kept)
    return (
        f"## textlint 校正結果\n\n"
        f"この {label} は作成済み。以下の指摘のうち直す価値があるものを編集で反映する。\n\n"
        f"{findings}\n\n"
    )


def main() -> None:
    """Answer on stdout. Not a top-level decision / additionalContext pair: PreToolUse reads
    context only out of hookSpecificOutput, so findings written at that level reach no one."""
    raw = sys.stdin.read()
    # Cheaper than a scan on a hook that fires for every Bash call. _target decides whether
    # this really writes a body; this only keeps the work off everything else.
    if not (("gh" in raw and "create" in raw) or ("git" in raw and "commit" in raw)):
        return

    from hook_payload import field, parse

    payload = parse(raw)
    tool_input = payload.get("tool_input")
    command = field(tool_input, "command")
    if not isinstance(command, str) or not command:
        return

    target = _target(command)
    if target is None:
        return
    mode, body = target

    parts = [_lint_section(body, mode)]
    if mode.checklist:
        parts.append(_checklist())
    context = "\n\n".join(p for p in parts if p)
    if not context:
        return
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "additionalContext": context,
                }
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
