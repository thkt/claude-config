#!/usr/bin/env python3
"""Enforcer correspondence for the always-loaded harness files.

Usage: enforcer_map.py <repo-root>, run with skills/_lib on PYTHONPATH.
Output: JSON array of {file, line_number, verdict, enforcer?} to stdout, one entry per
non-blank line across the always-loaded files, file order then line order.

Follows skills/census/scripts/list-source-files.py's shape (judgment held as a module
constant, a thin main() that walks the population and prints one line of output per member)
rather than a from-scratch script layout.

Caller contract: the caller puts skills/_lib on sys.path before importing this module
(skills/ablate/tests/enforcer_map_test.py, skills/ablate/tests/report_enforcer_test.py, and
whoever imports skills/ablate/scripts/report.py). This module does not manipulate sys.path
itself.

Not a CLI entry point during a test run: skills/ablate/tests/enforcer_map_test.py imports this
module for classify_line and the two verdict constants rather than shelling out to it
(docs/wiki/deterministic-script-judgment.md "入力から一意に決まる判定は script に置く").
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import harness_elements

DELETE_CANDIDATE = "delete-candidate"
ABLATION_RESIDUE = "ablation-residue"

# Correspondence table: an always-loaded line's exact text -> the hook / textlint / lint /
# test that already guarantees it. Held as a script constant, not prose, per
# docs/wiki/deterministic-script-judgment.md ("必須集合の充足は script に置く") — a line
# absent from this table has no verified enforcer, so classify_line reports it as
# ABLATION_RESIDUE rather than assuming coverage nobody checked.
#
# Every key here is copied verbatim (raw file text, unmodified) from its source file, and
# every value is a path this session confirmed two ways: it is registered as a hook in
# settings.json, and its own runtime output cites the rule it enforces
# (rules/core/OPERATION.md "Code claims | Read the lines before describing them"). A rule
# this session could not confirm an enforcer for is left out rather than guessed at
# (rules/core/OPERATION.md "Knowledge gaps | Verify... before proceeding").
ENFORCER_TABLE = {
    # rules/conventions/MIRROR.md, "Prose language" row: "Japanese under `.ja/`, English
    # everywhere else." hooks/edit/mirror_prose_guard.py is registered in settings.json as
    # the PostToolUse Edit/Write hook on both .ja/ and English-side paths, and
    # hooks/_lib/mirror_prose.py's check() / check_english() each cite "(MIRROR.md)" in the
    # warning they emit for exactly this violation (a .ja/ file with no Japanese, or an
    # English-side file still carrying Japanese).
    "| Prose language | Japanese under `.ja/`, English everywhere else. Covers comments, "
    "test names, and assertion messages                                                   |": (
        "hooks/edit/mirror_prose_guard.py"
    ),
}


def classify_line(line: str) -> str:
    """DELETE_CANDIDATE when `line` matches an ENFORCER_TABLE key verbatim — an existing
    hook/textlint/lint/test already guarantees it, so the always-loaded copy repeats what a
    script already checks on every run. ABLATION_RESIDUE otherwise: no verified enforcer
    covers this line today, so removing it would drop a guarantee nothing else replaces."""
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
    context. Derived from harness_elements at run time. A tuple copied out by hand silently
    drops a rules/**/*.md file added later, and skills/ablate/scripts/report.py renders the
    same population from its own enumerate_elements call, so a second spelling puts two
    disagreeing lists in one report (docs/wiki/harness-production-divergence.md
    "供給の一覧を実行側の定数として持つ")."""
    return [
        element["path"]
        for element in harness_elements.enumerate_elements(root)
        if element["classification"] == harness_elements.ALWAYS_LOADED
    ]


def map_all(root: Path) -> list[dict[str, object]]:
    """Classifies every non-blank line across the always-loaded files, file order then line
    order. Shared by main() and skills/ablate/scripts/report.py."""
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
