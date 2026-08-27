#!/usr/bin/env python3
"""Reads docs/wiki's `kind: structure` pages and the claims their sections carry.

docs/wiki/README.md fixes the section order for a structure page: 内容 → 境界 → 契約 → 要求 →
参照コード → 由来. 境界・参照コード・由来 are bullet lists; 契約・要求 are tables. A table's
header row and its `---` separator row are formatting, not a claim, so they are excluded.

Run: python3 structure_page.py <wiki-dir>
stdout: JSON { <page filename>: { <section>: [claim, ...], ... }, ... }
"""

import json
import sys
from pathlib import Path

# The frontmatter value docs/wiki/README.md names as the marker of a structure page, as
# opposed to a 共通項 page.
_KIND_LINE = "kind: structure"

# The fixed order docs/wiki/README.md gives a structure page's sections.
SECTIONS = ("内容", "境界", "契約", "要求", "参照コード", "由来")


def _frontmatter_lines(page: Path) -> list[str]:
    """The lines between the opening and closing `---` delimiters, found by scanning to the
    closing delimiter rather than assuming a fixed position."""
    lines = page.read_text(encoding="utf-8").split("\n")
    if not lines or lines[0] != "---":
        return []
    for i, line in enumerate(lines[1:], start=1):
        if line == "---":
            return lines[1:i]
    return []


def find_structure_pages(wiki_dir: Path) -> list[Path]:
    """Every page under wiki_dir whose frontmatter carries `kind: structure`."""
    return sorted(
        page
        for page in Path(wiki_dir).glob("*.md")
        if _KIND_LINE in _frontmatter_lines(page)
    )


def _section_body(text: str, heading: str) -> str:
    """The lines of one `## heading` section, up to the next `## ` heading or the end."""
    marker = f"\n## {heading}\n"
    if marker not in text:
        return ""
    body = text.split(marker, 1)[1]
    return body.split("\n## ", 1)[0]


def _claims(body: str) -> list[str]:
    """The claim lines a section body carries, in the section's own format.

    A table section's rows start with `|`: the first two (header, `---` separator) are
    formatting, so only the rows after them are claims. A bullet section's rows start with
    `- `. A prose section (内容) has neither, so every non-empty line is a claim."""
    lines = body.split("\n")
    table_rows = [line for line in lines if line.startswith("|")]
    if len(table_rows) >= 2:
        return table_rows[2:]
    bullets = [line for line in lines if line.startswith("- ")]
    if bullets:
        return bullets
    return [line for line in lines if line.strip()]


def read_claims(page: Path) -> dict[str, list[str]]:
    """The claims each of a structure page's six sections carries, keyed by section name."""
    text = page.read_text(encoding="utf-8")
    return {section: _claims(_section_body(text, section)) for section in SECTIONS}


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: structure_page.py <wiki-dir>", file=sys.stderr)
        sys.exit(2)
    wiki_dir = Path(sys.argv[1])
    report = {page.name: read_claims(page) for page in find_structure_pages(wiki_dir)}
    print(json.dumps(report, ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
