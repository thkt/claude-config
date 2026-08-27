"""Tests for skills/scribe/scripts/structure_page.py.

Run: python3 skills/scribe/tests/structure_page_test.py
"""

import ast
import difflib
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "scripts"))

from structure_page import find_structure_pages, read_claims  # noqa: E402

WIKI = ROOT / "docs" / "wiki"
WORKFLOW = ROOT / ".github" / "workflows" / "test.yml"

# The one structure page whose 契約/要求 name workflows/*.js machinery. U-002 cross-checks this
# page against the workflow scripts it describes, so the page is fixed rather than discovered.
PAGE = WIKI / "workflow-structure.md"

# Spelled out here rather than imported from structure_page: the scan below exists to reach the
# same answer independently, so borrowing the module's own literal would make the two sides echo.
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


def _referenced_path(claims: dict[str, list[str]], name: str) -> Path:
    """The file a 参照コード bullet names beside the given constant/function name, read from the
    bullet's own text rather than assumed. `- \\`<path>\\` の \\`<name>\\`` is the section's own
    format, checked separately by StructurePageClaims."""
    bullet = next(row for row in claims["参照コード"] if name in row)
    match = re.search(r"`([^`]+)` の `" + re.escape(name) + "`", bullet)
    assert match is not None, f"参照コード names {name} without a `<path>` の `{name}` bullet"
    return ROOT / match.group(1)


def _extract_unit_caps(source: str) -> dict[str, int] | None:
    """The {files, tests} the script's own UNIT_CAPS constant holds, read from its source text
    rather than imported (the script is JS, this test runs under Python). None when no
    UNIT_CAPS declaration of this shape is found, which a renamed constant also produces."""
    match = re.search(r"UNIT_CAPS\s*=\s*\{\s*files:\s*(\d+),\s*tests:\s*(\d+)\s*\}", source)
    if match is None:
        return None
    return {"files": int(match.group(1)), "tests": int(match.group(2))}


class StructurePageContractRequirement(unittest.TestCase):
    """U-002: workflow-structure.md's 契約/要求 claims cross-checked against the workflow
    scripts they describe, so a page and a script that drift apart show up as a failure
    instead of only as two documents that happen to agree today."""

    def test_the_unit_caps_the_page_states_match_the_UNIT_CAPS_constant_the_script_holds(
        self,
    ) -> None:
        """T-003: 要求 states `build` の unit's files/tests caps as prose; UNIT_CAPS is the
        script's own value. Both sides are read from their own source, not restated here."""
        claims = read_claims(PAGE)
        row = next(r for r in claims["要求"] if "`build` の unit" in r)
        match = re.search(r"files (\d+) / tests (\d+)", row)
        self.assertIsNotNone(match, f"要求 states build's unit caps as 'files N / tests N': {row}")
        assert match is not None
        page_caps = {"files": int(match.group(1)), "tests": int(match.group(2))}

        script_path = _referenced_path(claims, "UNIT_CAPS")
        script_caps = _extract_unit_caps(script_path.read_text(encoding="utf-8"))
        self.assertIsNotNone(script_caps, f"{script_path} carries a UNIT_CAPS constant")
        self.assertEqual(page_caps, script_caps)

    def test_the_no_repo_stop_the_page_states_is_reached_by_every_workflow_counting_the_ones_that_return_it_through_a_helper(  # noqa: E501
        self,
    ) -> None:
        """T-004: 契約 says every workflow returns `{ stopped: "<理由>", why }` before its body
        runs. 内容 names the 7 workflows the page covers; each one's script is checked for a
        no-repo stop reachable either as an inline `stopped: "no-repo"` return or as a call
        into a shared `stop("no-repo", ...)` helper, so the two return shapes count the same."""
        claims = read_claims(PAGE)
        content = "\n".join(claims["内容"])
        names = re.findall(r"`([a-z]+)`", content)
        self.assertTrue(names, "内容 names the workflows in backticks")
        for name in names:
            script_path = ROOT / "workflows" / f"{name}.js"
            self.assertTrue(script_path.exists(), f"{name}: {script_path} exists")
            source = script_path.read_text(encoding="utf-8")
            inline = 'stopped: "no-repo"' in source
            via_helper = re.search(r'stop\(\s*["\']no-repo["\']', source) is not None
            self.assertTrue(inline or via_helper, f"{name}: reaches a no-repo stop")
            # The claim is `{ stopped: "<理由>", why }`, so the second key is checked too.
            # Without this the row reads as covered while only half of it is.
            self.assertRegex(
                source,
                r'why:\s*[`"\']',
                f"{name}: the stop carries why alongside stopped, as `{{ stopped, why }}` states",
            )

    def test_renaming_the_constant_in_the_script_makes_the_check_fail(self) -> None:
        """T-005: mutates a copy of the referenced script's source, renaming UNIT_CAPS, and
        confirms the same extraction the previous scenario relies on no longer finds it. This
        is what tells the check in T-003 apart from two hardcoded literals that happen to
        agree: a check reading the real constant loses its answer when the name moves."""
        claims = read_claims(PAGE)
        script_path = _referenced_path(claims, "UNIT_CAPS")
        source = script_path.read_text(encoding="utf-8")
        self.assertIsNotNone(
            _extract_unit_caps(source), f"{script_path} carries UNIT_CAPS under its real name"
        )

        renamed = source.replace("UNIT_CAPS", "UNIT_CAPS_RENAMED")
        self.assertIsNone(
            _extract_unit_caps(renamed),
            "renaming the constant the page's 参照コード names makes the check unable to find it",
        )


# The shortest contiguous run shared between a claim row and this file's own source that
# counts as a test naming that row, rather than an accidental overlap on a common short word
# such as `build` or `repo` alone (see the length probe recorded on the U-003 unit).
_MIN_ANCHOR_LEN = 10


def checkable_source(test_source: str) -> str:
    """`test_source` with its docstrings and comments removed. Not the whole file: a docstring
    quoting a claim reads as coverage while asserting nothing, which is the same false positive
    the nesting grep hit on a comment and two description strings (issue #501)."""
    tree = ast.parse(test_source)
    spans: list[tuple[int, int]] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        doc = node.body[0] if node.body else None
        if (
            isinstance(doc, ast.Expr)
            and isinstance(doc.value, ast.Constant)
            and isinstance(doc.value.value, str)
            and doc.lineno is not None
            and doc.end_lineno is not None
        ):
            spans.append((doc.lineno, doc.end_lineno))
    lines = test_source.split("\n")
    dropped = {n for lo, hi in spans for n in range(lo, hi + 1)}
    kept = [
        line.split("#", 1)[0] if line.lstrip().startswith("#") else line
        for i, line in enumerate(lines, start=1)
        if i not in dropped
    ]
    return "\n".join(kept)


def _is_claim_checked(row: str, test_source: str) -> bool:
    """Whether some run of at least _MIN_ANCHOR_LEN characters in `row` also occurs verbatim
    in the checkable part of `test_source`. A test that checks a claim row carries a fragment
    of it in what it compares (T-003's `` `build` の unit ``), so the longest run the row and
    that part share is the signal."""
    checkable = checkable_source(test_source)
    matcher = difflib.SequenceMatcher(None, row, checkable, autojunk=False)
    match = matcher.find_longest_match(0, len(row), 0, len(checkable))
    return match.size >= _MIN_ANCHOR_LEN


def _unchecked_claim_rows(rows: list[str], test_source: str) -> list[str]:
    """The rows among `rows` that no test in `test_source` names by any fragment long enough
    to be a real anchor. Returns the row text itself, not a count, so the report can be acted
    on directly (docs/wiki/brittle-test-removal.md)."""
    return [row for row in rows if not _is_claim_checked(row, test_source)]


class StructurePageClaimCoverage(unittest.TestCase):
    """U-003: 境界/契約/要求 の主張のうち、このファイルのどのテストからも検査されていない行を、
    件数ではなく行の全文で名指しする。不在を見る検査には陽性対照を常設する
    (docs/wiki/zero-hit-positive-control.md)。"""

    def test_a_claim_row_with_no_check_is_reported_by_row_text_not_only_as_a_count(self) -> None:
        """T-006: workflow-structure.md の 契約/要求 のうち、このファイルのどのテストの
        本体にも現れない行を、_unchecked_claim_rows は件数ではなく行そのもので返す。
        すでに T-003/T-004 が検査している行は結果に含まれない。"""
        claims = read_claims(PAGE)
        rows = claims["境界"] + claims["契約"] + claims["要求"]
        test_source = Path(__file__).read_text(encoding="utf-8")

        unchecked = _unchecked_claim_rows(rows, test_source)

        self.assertIsInstance(unchecked, list, "unchecked は件数ではなく行の一覧で返る")
        for row in unchecked:
            self.assertIn(row, rows, "報告される要素は主張行そのもの")

        checked_row = next(r for r in claims["要求"] if "`build` の unit" in r)
        self.assertNotIn(checked_row, unchecked, "T-003 が検査済みの行は含まれない")
        stop_row = next(r for r in claims["契約"] if '{ stopped: "<理由>", why }' in r)
        self.assertNotIn(stop_row, unchecked, "T-004 が検査済みの行は含まれない")

    def test_the_positive_control_fails_when_it_is_removed(self) -> None:
        """T-007: T-003 が検査している要求の行を陽性対照とする。この行が検査済みと判定される
        のは、その行を検査しているテストの手掛かり文字列(`` `build` の unit ``)がこのファイルの
        中に実在するからであることを確かめるため、その手掛かりだけを取り除いたソースの写しに
        対しては同じ行が検査漏れとして落ちることを確認する。"""
        claims = read_claims(PAGE)
        anchor = "`build` の unit"
        control_row = next(r for r in claims["要求"] if anchor in r)
        test_source = Path(__file__).read_text(encoding="utf-8")

        self.assertEqual(
            _unchecked_claim_rows([control_row], test_source),
            [],
            "陽性対照: 検査済みの行は、検査が実在する間は検査漏れとして拾われない",
        )

        removed = test_source.replace(anchor, "REMOVED")
        self.assertNotIn(anchor, removed, "手掛かり文字列を取り除いた写しであることの確認")
        self.assertEqual(
            _unchecked_claim_rows([control_row], removed),
            [control_row],
            "陽性対照: 検査を取り除くと同じ行が検査漏れとして落ちる",
        )


def _imported_top_level_modules(source: str) -> set[str]:
    """The module names this source actually imports, read from its parsed `import` /
    `from ... import` statements rather than a substring search: a substring search over the
    same text a test's own assertion literal appears in would trivially match itself."""
    tree = ast.parse(source)
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module.split(".")[0])
    return modules


def _ci_python_find_command() -> str:
    """The `find ...` command CI's Python tests step runs, read from
    .github/workflows/test.yml itself rather than restated here, so a directory or pattern
    change on that side shows up as a mismatch instead of two copies that happen to agree."""
    text = WORKFLOW.read_text(encoding="utf-8")
    match = re.search(r"name: Python tests\n\s*run: (find[^\n]+)\n", text)
    assert match is not None, "test.yml carries a Python tests step running find"
    return match.group(1)


def _ci_discovered_test_paths() -> list[str]:
    """Every path CI's own find command discovers, run for real from ROOT (the discovery half
    of the pipe, before `| xargs ... python3` hands each path off)."""
    command = _ci_python_find_command().split("|", 1)[0].strip()
    proc = subprocess.run(command, shell=True, cwd=ROOT, capture_output=True, text=True, check=True)
    return [line for line in proc.stdout.split("\0") if line]


_NESTED_CI_RUN_ENV = "STRUCTURE_PAGE_TEST_NESTED_CI_RUN"


def _test_method_count() -> int:
    """The number of test methods unittest itself would collect from this module, read via the
    same loader unittest.main() uses rather than counted by hand."""
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(sys.modules[__name__])
    return suite.countTestCases()


class CIPythonTestDiscovery(unittest.TestCase):
    """U-004: the file U-001/U-002/U-003 built this module's tests into rides CI's python-test
    discovery, so a placement it does not match is caught here rather than silently skipped."""

    def test_the_ci_python_test_discovery_command_finds_this_test_file(self) -> None:
        """T-008: the CI python-test discovery command finds this test file."""
        discovered = _ci_discovered_test_paths()
        this_file = str(Path(__file__).resolve().relative_to(ROOT))
        self.assertIn(this_file, discovered)

    def test_the_discovered_file_runs_against_the_real_docs_wiki_pages_and_the_real_workflow_scripts_with_no_fixture_standing_in_for_either(  # noqa: E501
        self,
    ) -> None:
        """T-009: the discovered file runs against the real docs/wiki pages and the real
        workflow scripts, with no fixture standing in for either. Runs this module the same
        way CI's `xargs ... python3` invokes each discovered path (cwd ROOT, by relative
        path), then checks that every test method this loader counts, including this one,
        actually ran to completion, rather than a subset a fixture stood in for. Skips its own
        body inside the child process it spawns (_NESTED_CI_RUN_ENV), or the same subprocess
        spawn recurses into itself without end."""
        if os.environ.get(_NESTED_CI_RUN_ENV):
            self.skipTest("nested CI-shape run spawned by the outer run of this same scenario")
            return

        source = Path(__file__).read_text(encoding="utf-8")
        self.assertNotIn(
            "tempfile",
            _imported_top_level_modules(source),
            "no tempdir fixture stands in for docs/wiki or the workflow scripts this module reads",
        )
        self.assertTrue(WIKI.is_dir(), "the real docs/wiki directory this module reads exists")

        this_file = str(Path(__file__).resolve().relative_to(ROOT))
        proc = subprocess.run(
            [sys.executable, this_file],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, _NESTED_CI_RUN_ENV: "1"},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn(
            f"Ran {_test_method_count()} tests",
            proc.stderr,
            "every test method this module carries ran under CI's own invocation shape",
        )


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
