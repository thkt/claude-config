"""Tests for skills/scribe/scripts/structure_page.py.

Run: python3 skills/scribe/tests/structure_page_test.py
"""

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "scripts"))

from structure_page import find_structure_pages, read_claims  # noqa: E402

WIKI = ROOT / "docs" / "wiki"

# The frontmatter value docs/wiki/README.md names as the marker of a structure page, as
# opposed to a 共通項 page. Read once here so both test classes below share the one literal.
_KIND_LINE = "kind: structure"


def _frontmatter_lines(page: Path) -> list[str]:
    """The lines between the opening and closing `---` delimiters, found by scanning to the
    closing delimiter rather than assuming a fixed position. Independent of find_structure_pages:
    this reads the raw file directly, so the two sides can be compared instead of one echoing
    the other."""
    lines = page.read_text(encoding="utf-8").split("\n")
    if not lines or lines[0] != "---":
        return []
    for i, line in enumerate(lines[1:], start=1):
        if line == "---":
            return lines[1:i]
    return []


def _structure_pages_by_scan() -> list[str]:
    """Every docs/wiki page whose frontmatter carries `kind: structure`, found by scanning
    every page's frontmatter directly rather than calling find_structure_pages."""
    return sorted(page.name for page in WIKI.glob("*.md") if _KIND_LINE in _frontmatter_lines(page))


def _section_body(text: str, heading: str) -> str:
    """The lines of one `## heading` section, up to the next `## ` heading or the end."""
    marker = f"\n## {heading}\n"
    if marker not in text:
        return ""
    body = text.split(marker, 1)[1]
    return body.split("\n## ", 1)[0]


def _bullet_rows(body: str) -> list[str]:
    return [line for line in body.split("\n") if line.startswith("- ")]


def _table_data_rows(body: str) -> list[str]:
    """A table's data rows, with the header row and its `---` separator row excluded. Both
    always come first when a table is present, so the check is positional, not a pattern
    match on `---` that a data row's own contents could also produce."""
    lines = [line for line in body.split("\n") if line.startswith("|")]
    if len(lines) < 2:
        return []
    return lines[2:]


class StructurePageDiscovery(unittest.TestCase):
    def test_every_page_carrying_kind_structure_is_discovered_from_docs_wiki_without_naming_the_filenames_in_the_test(  # noqa: E501
        self,
    ) -> None:
        """T-001: find_structure_pages and an independent frontmatter scan of the same
        directory have to agree on which pages carry `kind: structure`, without either side
        naming a page's filename."""
        found = sorted(page.name for page in find_structure_pages(WIKI))
        expected = _structure_pages_by_scan()
        self.assertTrue(expected, "docs/wiki carries at least one kind: structure page")
        self.assertEqual(found, expected)


class StructurePageClaims(unittest.TestCase):
    def test_the_boundary_contract_and_requirement_rows_come_back_separately_with_table_header_and_separator_rows_excluded(  # noqa: E501
        self,
    ) -> None:
        """T-002: 境界 (a bullet list), 契約, and 要求 (both tables) are read back as three
        separate collections, each compared against an independent extraction from the page's
        own text, so a header or separator row leaking through shows up as a mismatch rather
        than passing on a presence check alone."""
        pages = find_structure_pages(WIKI)
        self.assertTrue(pages, "docs/wiki carries at least one kind: structure page")
        for page in pages:
            text = page.read_text(encoding="utf-8")
            claims = read_claims(page)
            for section in ("境界", "契約", "要求"):
                self.assertIn(section, claims, f"{page.name}: {section}")

            expected_boundary = _bullet_rows(_section_body(text, "境界"))
            self.assertEqual(claims["境界"], expected_boundary, f"{page.name}: 境界")

            for section in ("契約", "要求"):
                expected_rows = _table_data_rows(_section_body(text, section))
                self.assertEqual(claims[section], expected_rows, f"{page.name}: {section}")
                for row in claims[section]:
                    self.assertNotRegex(
                        row,
                        r"^\|(?: *-+ *\|)+$",
                        f"{page.name}: {section} carries a separator row",
                    )

            # 境界 comes back as its own collection, not merged with the table sections.
            self.assertNotEqual(
                claims["境界"],
                claims["契約"],
                f"{page.name}: 境界 and 契約 come back separately",
            )


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
