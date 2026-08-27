#!/usr/bin/env python3
"""Enforcer correspondence for the 8 always-loaded harness files.

Usage: enforcer_map.py <repo-root>
Output: JSON array of {file, line_number, verdict, enforcer?} to stdout, one entry per
non-blank line across TARGET_FILES, file order then line order.

Follows skills/census/scripts/list-source-files.py's shape (population + judgment held as
module constants, a thin main() that walks the population and prints one line of output per
member) rather than a from-scratch script layout.

Not a CLI entry point during a test run: skills/ablate/tests/enforcer_map_test.py imports this
module for classify_line and the two verdict constants rather than shelling out to it
(docs/wiki/deterministic-script-judgment.md "入力から一意に決まる判定は script に置く").
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# The 8 files this repo's harness always loads into every session's context: the root
# CLAUDE.md and every rules/**/*.md file that carries no frontmatter
# (skills/_lib/harness_elements.py's classify() ALWAYS_LOADED rule — a rules/**/*.md file or
# CLAUDE.md with no frontmatter block). Held here as a module constant, not copied by hand
# into SKILL.md prose (docs/wiki/harness-production-divergence.md "供給の一覧を実行側の定数
# として持つ").
TARGET_FILES = (
    "CLAUDE.md",
    "rules/PRINCIPLES.md",
    "rules/core/PREFLIGHT.md",
    "rules/core/BOUNDARIES.md",
    "rules/core/OUTCOME.md",
    "rules/core/OPERATION.md",
    "rules/conventions/PROSE.md",
    "rules/conventions/MIRROR.md",
)

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


def map_all(root: Path) -> list[dict[str, object]]:
    """Classifies every non-blank line across TARGET_FILES, file order then line order.
    Shared by main() and skills/ablate/scripts/report.py so the file-existence guard (a
    target file missing — a narrower checkout, a renamed rule file — must not stop the
    mapping for the rest, mirroring skills/census/scripts/list-source-files.py's
    count_lines for one unreadable source file) lives once rather than in both callers."""
    results: list[dict[str, object]] = []
    for rel_path in TARGET_FILES:
        if not (root / rel_path).is_file():
            continue
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
