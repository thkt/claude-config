"""Tests for report.py's enforcer-map integration.

Each case cross-checks report.py's output against what enforcer_map independently returns
for the same root, so a change to enforcer_map.py cannot pass here unseen.

Run: python3 skills/ablate/tests/report_enforcer_test.py
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))
sys.path.insert(0, str(HERE.parent.parent / "_lib"))

import enforcer_map  # noqa: E402
import harness_elements  # noqa: E402
import report  # noqa: E402

# build_report scans TRANSCRIPTS_ROOT on every call. Pointed at an empty directory here so no
# test reads the real ~/.claude/projects tree.
_EMPTY_TRANSCRIPTS = tempfile.TemporaryDirectory()
_TRANSCRIPTS_PATCH = patch.object(report, "TRANSCRIPTS_ROOT", Path(_EMPTY_TRANSCRIPTS.name))


def setUpModule() -> None:
    _TRANSCRIPTS_PATCH.start()


def tearDownModule() -> None:
    _TRANSCRIPTS_PATCH.stop()
    _EMPTY_TRANSCRIPTS.cleanup()


def _write(root: Path, rel: str, content: str) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


# Taken from enforcer_map_test.py's own fixtures rather than invented here, so both files
# exercise the same two shapes.
COVERED_LINE = "never use --no-verify"
SAMPLE_ENFORCER = "hooks/pre-commit-block-no-verify.py"
UNCOVERED_LINE = "always ask before deleting a branch"


class EnforcerMapIntegration(unittest.TestCase):
    def test_report_py_runs_the_enforcer_map_and_writes_its_rows_into_the_report(
        self,
    ) -> None:
        """T-004 report.py runs the enforcer map and writes its rows into the report"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write(root, "rules/sample.md", f"{COVERED_LINE}\n")

            with tempfile.TemporaryDirectory() as out_tmp:
                out_dir = Path(out_tmp)

                with (
                    patch.object(enforcer_map, "target_files", lambda _root: ["rules/sample.md"]),
                    patch.object(enforcer_map, "ENFORCER_TABLE", {COVERED_LINE: SAMPLE_ENFORCER}),
                ):
                    expected_rows = enforcer_map.classify_file(root, "rules/sample.md")

                    result = report.build_report(root, observations=[])
                    report_path = report.write_report(root, [], out_dir=out_dir)

                content = report_path.read_text(encoding="utf-8")

            self.assertEqual(result["enforcer_rows"], expected_rows)
            self.assertIn("## Always-Loaded Elements", content)
            # SAMPLE_ENFORCER appears nowhere else in the report, so finding it proves the
            # row reached the written output rather than some other section carrying it.
            self.assertIn(SAMPLE_ENFORCER, content)


class AblationResidueInReport(unittest.TestCase):
    def test_a_line_with_no_matching_enforcer_appears_in_the_report_as_ablation_residue(
        self,
    ) -> None:
        """T-005 a line with no matching enforcer appears in the report as ablation residue"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write(root, "rules/sample.md", f"{UNCOVERED_LINE}\n")

            with tempfile.TemporaryDirectory() as out_tmp:
                out_dir = Path(out_tmp)

                with (
                    patch.object(enforcer_map, "target_files", lambda _root: ["rules/sample.md"]),
                    patch.object(enforcer_map, "ENFORCER_TABLE", {}),
                ):
                    expected_rows = enforcer_map.classify_file(root, "rules/sample.md")
                    self.assertEqual(expected_rows[0]["verdict"], enforcer_map.ABLATION_RESIDUE)

                    result = report.build_report(root, observations=[])
                    report_path = report.write_report(root, [], out_dir=out_dir)

                content = report_path.read_text(encoding="utf-8")

            self.assertEqual(result["enforcer_rows"], expected_rows)
            self.assertIn("## Always-Loaded Elements", content)
            # verdict.py never emits ablation-residue, so finding it proves the row reached
            # the written output rather than some other section carrying it.
            self.assertIn(enforcer_map.ABLATION_RESIDUE, content)


REPO_ROOT = HERE.parent.parent.parent


class OnePopulationPerReport(unittest.TestCase):
    """One report reaches the always-loaded population twice, through build_report's own
    enumeration and through enforcer_map. A second spelling of that population covered 8 of
    the 9 files while the elements section listed all 9."""

    def test_the_enforcer_rows_cover_every_always_loaded_element_the_report_lists(
        self,
    ) -> None:
        """T-006 the enforcer rows cover every always-loaded element the report lists"""
        # The real repository root, nothing patched: a tempdir fixture holds only what the
        # test wrote, so it agrees with any population and catches no divergence.
        result = report.build_report(REPO_ROOT, observations=[])

        listed = {
            element["path"]
            for element in result["elements"]
            if element["classification"] == harness_elements.ALWAYS_LOADED
        }
        mapped = {str(row["file"]) for row in result["enforcer_rows"]}

        self.assertTrue(listed, "the repository holds at least one always-loaded element")
        self.assertEqual(mapped, listed)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
