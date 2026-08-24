#!/usr/bin/env python3
"""Usage: harness_hash.py <skill-name>

stdout: JSON { definition_sha256, skill_sha256, corpus_sha256 }
exit: 0 on success, 1 when the skill is missing one of the three, 2 without an argument

Not the run date: CI checks out shallow, so there is no history to compare a date against.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Not the files expected.json names: a case sitting outside the answer key still reaches the
# reviewer, so a run that saw it measured a different corpus.
CORPUS_PARTS = ("cases", "expected.json")


def _digest(pairs: list[tuple[str, bytes]]) -> str:
    h = hashlib.sha256()
    # Sorted, so the digest does not carry the order the filesystem walk happened to return.
    for name, content in sorted(pairs):
        h.update(name.encode("utf-8"))
        h.update(b"\0")
        h.update(content)
        h.update(b"\0")
    return h.hexdigest()


def agent_name(skill: str) -> str:
    return skill.replace("use-context-", "")


def definition_path(skill: str) -> Path:
    return ROOT / "agents" / "reviewers" / f"{agent_name(skill)}.md"


def skill_path(skill: str) -> Path:
    return ROOT / "skills" / skill / "SKILL.md"


def test_dir(skill: str) -> Path:
    return ROOT / "skills" / skill / "test"


def corpus_files(skill: str) -> list[Path]:
    base = test_dir(skill)
    found: list[Path] = []
    for part in CORPUS_PARTS:
        target = base / part
        if target.is_dir():
            found.extend(p for p in sorted(target.rglob("*")) if p.is_file())
        elif target.is_file():
            found.append(target)
    return found


def hashes(skill: str) -> dict[str, str]:
    definition, body = definition_path(skill), skill_path(skill)
    for path, what in ((definition, "reviewer definition"), (body, "SKILL.md")):
        if not path.is_file():
            raise FileNotFoundError(f"no {what} for {skill}: {path}")
    files = corpus_files(skill)
    if not files:
        raise FileNotFoundError(f"no corpus for {skill}: {test_dir(skill)}")
    base = test_dir(skill)
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
