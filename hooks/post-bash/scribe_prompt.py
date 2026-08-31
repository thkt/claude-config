#!/opt/homebrew/bin/python3
"""PostToolUse hook: nudge toward /scribe when a git pull just brought down new work.

The Bash tool_response carries no exit code
(https://code.claude.com/docs/en/hooks#posttooluse-decision-control), so `interrupted` is the
only field saying the call did not complete.
"""

# python3 on a cut-down PATH can be old enough to reject `X | None` at import time.
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

import scribe_trigger
from hook_payload import field, notify, parse


def _tool_response_failed(payload: dict[str, object]) -> bool:
    return bool(field(field(payload, "tool_response"), "interrupted"))


def main() -> None:
    payload = parse(sys.stdin.read())
    if _tool_response_failed(payload):
        return
    command = field(field(payload, "tool_input"), "command")
    if not isinstance(command, str) or not command:
        return
    try:
        directory = scribe_trigger.find(command)
    except ValueError:
        # command_scan raises on a line shlex cannot close, and letting it out would report a
        # hook error on an ordinary command.
        return
    if directory is None:
        return
    if not scribe_trigger.should_prompt(directory):
        return
    message = (
        "scribe_prompt: 直近の pull で docs/wiki/ 未反映の入力が増えた。"
        "/scribe を実行して知見を抽出する。"
    )
    notify(message)


if __name__ == "__main__":
    main()
