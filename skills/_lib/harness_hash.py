#!/usr/bin/env python3
"""Usage: harness_hash.py <skill-name>

stdout: JSON { definition_sha256, skill_sha256, corpus_sha256 }
exit: 0 on success, 1 when the skill has no reviewer definition or no corpus, 2 without an argument

The two hashes name what a reviewer accuracy run measured. A record carrying them lets the
freshness gate tell a run of the current reviewer from a run of an older one, which a run date
cannot: CI checks out shallow and has no history to compare a date against.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# What the reviewer does is decided by the agent definition and the skill body together, so
# each is named by its own key.
# The corpus is every file the reviewer is judged against plus the answer key. A case added
# without a matching expected.json entry still changes the hash, which is the intent: the run
# saw a different corpus.
CORPUS_PARTS = ("cases", "expected.json")


def _digest(pairs: list[tuple[str, bytes]]) -> str:
    """One digest over (path, content) pairs, ordered by path so it does not depend on the walk."""
    h = hashlib.sha256()
    for name, content in sorted(pairs):
        h.update(name.encode("utf-8"))
        h.update(b"\0")
        h.update(content)
        h.update(b"\0")
    return h.hexdigest()


def agent_name(skill: str) -> str:
    """The reviewer a use-context skill dispatches, read off the skill's own name."""
    return skill.replace("use-context-", "")


def definition_path(skill: str) -> Path:
    return ROOT / "agents" / "reviewers" / f"{agent_name(skill)}.md"


def skill_path(skill: str) -> Path:
    return ROOT / "skills" / skill / "SKILL.md"


def corpus_files(skill: str) -> list[Path]:
    base = ROOT / "skills" / skill / "test"
    found: list[Path] = []
    for part in CORPUS_PARTS:
        target = base / part
        if target.is_dir():
            found.extend(p for p in sorted(target.rglob("*")) if p.is_file())
        elif target.is_file():
            found.append(target)
    return found


def hashes(skill: str) -> dict[str, str]:
    definition = definition_path(skill)
    if not definition.is_file():
        raise FileNotFoundError(f"no reviewer definition for {skill}: {definition}")
    files = corpus_files(skill)
    if not files:
        raise FileNotFoundError(f"no corpus for {skill}")
    base = ROOT / "skills" / skill / "test"
    body = skill_path(skill)
    if not body.is_file():
        raise FileNotFoundError(f"no SKILL.md for {skill}: {body}")
    return {
        "definition_sha256": _digest([(definition.name, definition.read_bytes())]),
        "skill_sha256": _digest([(body.name, body.read_bytes())]),
        "corpus_sha256": _digest([(str(p.relative_to(base)), p.read_bytes()) for p in files]),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        print(json.dumps(hashes(argv[1]), ensure_ascii=False))
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
