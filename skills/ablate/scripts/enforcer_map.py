#!/usr/bin/env python3
"""Enforcer correspondence for the always-loaded harness files.

Usage: enforcer_map.py <repo-root>, run with skills/_lib on PYTHONPATH.
Output: JSON array of {file, line_number, verdict, enforcer?} to stdout, one entry per
non-blank line across the always-loaded files, file order then line order.

The caller puts skills/_lib on sys.path before importing this module; it does not do so
itself, following skills/ablate/scripts/report.py's own contract.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import harness_elements

DELETE_CANDIDATE = "delete-candidate"
ABLATION_RESIDUE = "ablation-residue"

# An always-loaded line's exact text -> the enforcer that already guarantees it. A rule
# whose enforcer could not be confirmed stays out rather than being guessed at, so an
# absent line reports as ABLATION_RESIDUE instead of as coverage nobody checked.
ENFORCER_TABLE = {
    # settings.json registers the guard as the PostToolUse Edit/Write hook on both trees,
    # and hooks/_lib/mirror_prose.py's warning cites "(MIRROR.md)" for this exact violation.
    "| Prose language | Japanese under `.ja/`, English everywhere else. Covers comments, "
    "test names, and assertion messages                                                   |": (
        "hooks/edit/mirror_prose_guard.py"
    ),
}


def classify_line(line: str) -> str:
    """DELETE_CANDIDATE when an enforcer already guarantees `line`, ABLATION_RESIDUE
    otherwise. Residue is not a keep verdict: it says removing the line would drop a
    guarantee nothing else replaces."""
    return DELETE_CANDIDATE if line in ENFORCER_TABLE else ABLATION_RESIDUE


def classify_file(root: Path, rel_path: str) -> list[dict[str, object]]:
    """Classifies every non-blank line of one target file, in file order. A blank line
    carries no rule to map, so it is skipped rather than reported as residue."""
    text = (root / rel_path).read_text(encoding="utf-8")
    results: list[dict[str, object]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        verdict = classify_line(line)
        entry: dict[str, object] = {
            "file": rel_path,
            "line_number": line_number,
            "verdict": verdict,
        }
        if verdict == DELETE_CANDIDATE:
            entry["enforcer"] = ENFORCER_TABLE[line]
        results.append(entry)
    return results


def target_files(root: Path) -> list[str]:
    """The repo-root-relative paths `root`'s harness always loads into every session's
    context. Derived at run time rather than held as a tuple: a hand-written copy drops a
    rules/**/*.md file added later, and report.py renders the same population from its own
    enumerate_elements call, so a second spelling puts two disagreeing lists in one report
    (docs/wiki/harness-production-divergence.md "供給の一覧を実行側の定数として持つ")."""
    return [
        element["path"]
        for element in harness_elements.enumerate_elements(root)
        if element["classification"] == harness_elements.ALWAYS_LOADED
    ]


def map_all(root: Path) -> list[dict[str, object]]:
    """Classifies every non-blank line across the always-loaded files, file order then line
    order."""
    results: list[dict[str, object]] = []
    for rel_path in target_files(root):
        results.extend(classify_file(root, rel_path))
    return results


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: enforcer_map.py <repo-root>", file=sys.stderr)
        return 2
    print(json.dumps(map_all(Path(argv[1])), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
