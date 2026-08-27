"""Tests for skills/ablate/scripts/enforcer_map.py.

Run: python3 skills/ablate/tests/enforcer_map_test.py
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))

import enforcer_map  # noqa: E402


class DeleteCandidate(unittest.TestCase):
    def test_a_line_an_existing_enforcer_already_covers_is_reported_as_a_delete_candidate(
        self,
    ) -> None:
        """T-001 A line an existing enforcer already covers is reported as a delete candidate"""
        line = "never use --no-verify"
        table = {line: "hooks/pre-commit-block-no-verify.py"}

        with patch.object(enforcer_map, "ENFORCER_TABLE", table):
            result = enforcer_map.classify_line(line)

        self.assertEqual(result, enforcer_map.DELETE_CANDIDATE)


class AblationResidue(unittest.TestCase):
    def test_a_line_with_no_matching_enforcer_is_reported_as_ablation_residue(self) -> None:
        """T-002 A line with no matching enforcer is reported as ablation residue"""
        table = {"never use --no-verify": "hooks/pre-commit-block-no-verify.py"}

        with patch.object(enforcer_map, "ENFORCER_TABLE", table):
            result = enforcer_map.classify_line("always ask before deleting a branch")

        self.assertEqual(result, enforcer_map.ABLATION_RESIDUE)


class TableDriven(unittest.TestCase):
    def test_removing_an_entry_from_the_enforcer_table_moves_its_line_to_ablation_residue(
        self,
    ) -> None:
        """T-003 Removing an entry from the enforcer table moves its line to ablation residue"""
        line = "never use --no-verify"
        covered_table = {line: "hooks/pre-commit-block-no-verify.py"}

        with patch.object(enforcer_map, "ENFORCER_TABLE", covered_table):
            before = enforcer_map.classify_line(line)

        self.assertEqual(before, enforcer_map.DELETE_CANDIDATE)

        table_without_entry: dict[str, str] = {}

        with patch.object(enforcer_map, "ENFORCER_TABLE", table_without_entry):
            after = enforcer_map.classify_line(line)

        self.assertEqual(after, enforcer_map.ABLATION_RESIDUE)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
