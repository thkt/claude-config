"""Typed reads of a hook payload.

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


def edited_file(text: str) -> str | None:
    """The path a Write or Edit call touched, or None for anything else."""
    payload = parse(text)
    if payload.get("tool_name") not in ("Write", "Edit"):
        return None
    path = field(payload.get("tool_input"), "file_path")
    if not isinstance(path, str) or not path:
        return None
    return path
