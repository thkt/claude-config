"""Tests for skills/ablate/scripts/arms.py.

Run: python3 skills/ablate/tests/arms_test.py
"""

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))

import arms  # noqa: E402


class ArmCommands(unittest.TestCase):
    def test_the_wiped_arm_command_carries_the_setting_sources_project_flag(self) -> None:
        """T-005 The wiped arm command carries the setting-sources project flag"""
        command = arms.arm_command(arms.WIPED)

        self.assertIn("--setting-sources", command)
        flag_index = command.index("--setting-sources")
        self.assertEqual(command[flag_index + 1], "project")

    def test_the_restore_arm_injects_one_element_through_append_system_prompt(self) -> None:
        """T-006 The restore arm injects one element through append-system-prompt"""
        element = "rules/example.md"

        command = arms.arm_command(arms.WIPED_PLUS_ONE, element=element)

        self.assertIn("--append-system-prompt", command)
        flag_index = command.index("--append-system-prompt")
        self.assertIn(element, command[flag_index + 1])


class RunCountThreshold(unittest.TestCase):
    def test_a_result_with_fewer_runs_than_the_run_count_constant_is_reported_as_unmeasured(
        self,
    ) -> None:
        """T-007 A result with fewer runs than the run-count constant is reported as unmeasured"""
        short_of_run_count = arms.RUN_COUNT - 1

        self.assertEqual(arms.measurement_status(short_of_run_count), arms.UNMEASURED)

    def test_lowering_the_run_count_constant_changes_which_results_are_reported_as_measured(
        self,
    ) -> None:
        """T-008 Lowering the run-count constant changes which results are reported as measured"""
        runs = arms.RUN_COUNT - 1
        self.assertEqual(arms.measurement_status(runs), arms.UNMEASURED)

        original_run_count = arms.RUN_COUNT
        try:
            arms.RUN_COUNT = runs
            self.assertEqual(arms.measurement_status(runs), arms.MEASURED)
        finally:
            arms.RUN_COUNT = original_run_count


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
