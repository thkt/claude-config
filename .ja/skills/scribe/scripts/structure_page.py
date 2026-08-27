#!/usr/bin/env python3
"""docs/wiki の `kind: structure` ページと、その各節が持つ主張を読む。

構造ページの節の順は docs/wiki/README.md が固定する: 内容 → 境界 → 契約 → 要求 →
参照コード → 由来。境界・参照コード・由来 は箇条書き、契約・要求 は表。表の見出し行と
`---` の区切り行は書式であって主張ではないので除く。

skills/scribe/tests/structure_page_test.py が import する。CLI ではない。シェルから
実行する経路が無いので argv を扱わない。
"""

from pathlib import Path

# docs/wiki/README.md が構造ページの目印として名指す frontmatter の値。共通項ページとの区別。
_KIND_LINE = "kind: structure"

# docs/wiki/README.md が構造ページの節に与える固定の順序。
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
        page for page in Path(wiki_dir).glob("*.md") if _KIND_LINE in _frontmatter_lines(page)
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
