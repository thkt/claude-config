#!/usr/bin/env python3
"""Usage: validate-dr.py <dr-file>

stdout: JSON { file, errors, warnings, checks }
exit: 0 if no errors (warnings allowed), 1 if errors
"""

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from dr_common import fail, split_frontmatter

# Confirmation は Decision Outcome 配下の h3 で、他は h2。section 検出はどちらの
# レベルも許すので、正しい h3 の Confirmation が missing 扱いにならない。
REQUIRED_SECTIONS = (
    "Context and Problem Statement",
    "Considered Options",
    "Decision Outcome",
    "Confirmation",
)

# 既存構造の削除や統合を提案する側がこの節を読んで判定するので、欠けると判定材料が無い。
# madr-format が推奨セクションとして扱うので、error でなく warning で出す。
RECOMMENDED_SECTIONS = ("Reassessment Triggers",)


def count_options(lines: list[str]) -> int:
    """Considered Options 見出しの直下にある bullet または番号付き item を数える。"""
    depth = 0
    count = 0
    for line in lines:
        # h2 だけを見ると、セクション検査が present と判定した見出しに 0 件を返す。
        opening = re.match(r"^(#{2,3}) Considered Options\s*$", line)
        if opening:
            depth = len(opening.group(1))
            continue
        if not depth:
            continue
        heading = re.match(r"^(#+) ", line)
        # 深い見出しは Considered Options の小見出しなので、その bullet も数に入れる。
        if heading and len(heading.group(1)) <= depth:
            break
        if re.match(r"^\s*([-*]|\d+\.)\s", line):
            count += 1
    return count


def lint_check(path: Path) -> tuple[str, str]:
    """markdownlint-cli2 (インストール済みの場合) から ('checks' | 'warnings', message) を返す。"""
    if not shutil.which("markdownlint-cli2"):
        return "checks", "markdown_lint=skipped (markdownlint-cli2 not installed)"
    candidates: list[str | None] = [
        os.environ.get("MARKDOWNLINT_CONFIG"),
        ".markdownlint.json",
    ]
    config = next((c for c in candidates if c and Path(c).is_file()), None)
    cmd = ["markdownlint-cli2"] + (["--config", config] if config else []) + [str(path)]
    if subprocess.run(cmd, capture_output=True, check=False).returncode == 0:
        return "checks", "markdown_lint=ok"
    return "warnings", "markdown_lint=issues (run markdownlint-cli2 for details)"


def main() -> None:
    dr_file = sys.argv[1] if len(sys.argv) > 1 else ""
    path = Path(dr_file)
    if not path.is_file():
        fail(f"Error: file not found: {dr_file}")

    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    results: dict[str, list[str]] = {"errors": [], "warnings": [], "checks": []}

    for section in REQUIRED_SECTIONS + RECOMMENDED_SECTIONS:
        if re.search(rf"^#{{2,3}} {re.escape(section)}\s*$", text, flags=re.MULTILINE):
            results["checks"].append(f"section:{section}=ok")
        elif section in REQUIRED_SECTIONS:
            results["errors"].append(f"missing_section:{section}")
        else:
            results["warnings"].append(f"missing_section:{section} (recommended)")

    # MADR v4 frontmatter: status と date は optional だが推奨
    frontmatter, _ = split_frontmatter(text)
    if frontmatter:
        results["checks"].append("frontmatter=present")
        for meta in ("status", "date"):
            raw = next((line for line in frontmatter if line.startswith(f"{meta}:")), None)
            if raw:
                results["checks"].append(f"metadata:{meta}=ok [{raw}]")
            else:
                results["warnings"].append(
                    f"missing_metadata:{meta} (recommended in MADR v4 frontmatter)"
                )
    else:
        results["warnings"].append(
            "missing_frontmatter (MADR v4 supports optional YAML frontmatter"
            + " for status/date/decision-makers)"
        )

    options_count = count_options(lines)
    if options_count >= 2:
        results["checks"].append(f"options_count={options_count}")
    elif options_count == 1:
        results["warnings"].append("options_count=1 (recommended: 2+)")
    else:
        results["errors"].append("options_count=0")

    if any(line.startswith("# ") for line in lines):
        results["checks"].append("title_heading=ok")
    else:
        results["errors"].append("title_heading=missing")

    kind, message = lint_check(path)
    results[kind].append(message)

    print(json.dumps({"file": path.name, **results}, indent=2))
    sys.exit(1 if results["errors"] else 0)


if __name__ == "__main__":
    main()
