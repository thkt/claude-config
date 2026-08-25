#!/usr/bin/env python3
"""PostToolUse hook: nudge toward /scribe when a gh pr merge / gh issue close just completed.

hooks/_lib/scribe_trigger.py holds the judgment -- which command line runs a trigger, and
whether it is worth prompting for. This hook only connects that judgment to a live Bash
tool_response and writes the output shape hooks/_lib/mirror_prose.py's `emit` establishes:
systemMessage for the human, hookSpecificOutput.additionalContext for the agent.

The Bash tool_response is `{stdout, stderr, interrupted, isImage}`
(https://code.claude.com/docs/en/hooks#posttooluse-decision-control) -- there is no separate
exit-code field. `interrupted` is the one boolean that shape carries, so it is read here as
"the call failed": a merge/close that did not complete landed nothing new, and prompting on
it would point the user at work that never happened.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this module loadable there.
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
        trigger = scribe_trigger.find(command)
    except ValueError:
        # command_scan raises on a line shlex cannot close. A hook that lets it out exits 1
        # with a traceback, which Claude Code reports as a hook error on an ordinary command.
        return
    if trigger is None:
        return
    if not scribe_trigger.should_prompt(trigger):
        return
    message = (
        "scribe_prompt: 直近の merge / close で docs/wiki/ 未反映の入力が増えた。"
        "/scribe を実行して知見を抽出する。"
    )
    notify(message)


if __name__ == "__main__":
    main()
