"""Typed reads of a hook payload, and the one write a PreToolUse hook makes.

json.loads returns Any, and isinstance narrows a dict only to dict[Unknown, Unknown], so a
field read straight from the payload spreads Unknown through every caller a type checker
follows. This module is the one place that admits it. Values leave here as object, which a
caller has to isinstance before using.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this module loadable there.
from __future__ import annotations

import json
from typing import cast


def _mapping(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    return cast("dict[str, object]", value)


def parse(text: str) -> dict[str, object]:
    """The payload as a mapping, empty for anything that is not one."""
    try:
        loaded = cast("object", json.loads(text or "{}"))
    except ValueError:
        return {}
    return _mapping(loaded) or {}


def field(container: object, key: str) -> object:
    """One key out of a nested mapping, None when the container is not one."""
    mapping = _mapping(container)
    return mapping.get(key) if mapping is not None else None


def deny(reason: str) -> None:
    """Refuse the call, naming what has to change before it can run.

    The envelope is the PreToolUse contract, so every hook that stops a call emits the same
    shape. What differs between them is the reason, which the caller writes.

    Not a top-level `decision`: PreToolUse accepts only "block" there, so an "approve" written
    at that level asserts a permission the harness never grants.
    """
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            },
            ensure_ascii=False,
        )
    )


def edited_file(text: str) -> str | None:
    """The path a Write or Edit call touched, or None for anything else."""
    payload = parse(text)
    if payload.get("tool_name") not in ("Write", "Edit"):
        return None
    path = field(payload.get("tool_input"), "file_path")
    if not isinstance(path, str) or not path:
        return None
    return path
