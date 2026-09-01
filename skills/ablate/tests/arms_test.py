"""Tests for skills/ablate/scripts/arms.py.

Run: python3 skills/ablate/tests/arms_test.py
"""

import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))

import arms  # noqa: E402

TASK = "edit a file under .ja/ and mirror it"


class ArmCommands(unittest.TestCase):
    def test_every_arm_ends_with_the_task_as_the_prompt(self) -> None:
        for arm in (arms.WIPED, arms.FULL_HARNESS):
            with self.subTest(arm):
                self.assertEqual(arms.arm_command(arm, TASK)[-1], TASK)

    def test_the_wiped_arm_command_carries_the_setting_sources_project_flag(self) -> None:
        """T-005 The wiped arm command carries the setting-sources project flag"""
        command = arms.arm_command(arms.WIPED, TASK)

        flag_index = command.index("--setting-sources")
        self.assertEqual(command[flag_index + 1], "project")

    def test_the_full_harness_arm_carries_no_restricting_flag(self) -> None:
        command = arms.arm_command(arms.FULL_HARNESS, TASK)

        self.assertNotIn("--setting-sources", command)
        self.assertNotIn("--append-system-prompt", command)

    def test_the_restore_arm_injects_the_elements_text_through_append_system_prompt(self) -> None:
        """T-006 The restore arm injects one element's text through append-system-prompt"""
        element = "rules/example.md"
        body = "# Example rule\n\nNever skip the mirror.\n"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "rules").mkdir()
            (root / element).write_text(body, encoding="utf-8")

            command = arms.arm_command(arms.WIPED_PLUS_ONE, TASK, element=element, root=root)

        flag_index = command.index("--append-system-prompt")
        injected = command[flag_index + 1]
        self.assertIn(element, injected)
        self.assertIn(body, injected)
        self.assertIn("--setting-sources", command)

    def test_the_restore_arm_refuses_to_run_without_an_element_and_root(self) -> None:
        with self.assertRaises(ValueError):
            arms.arm_command(arms.WIPED_PLUS_ONE, TASK)
        with self.assertRaises(ValueError):
            arms.arm_command(arms.WIPED_PLUS_ONE, TASK, element="rules/example.md")


class JudgeRuns(unittest.TestCase):
    def test_fewer_runs_than_the_run_count_constant_yield_no_verdict(self) -> None:
        """T-007 A result with fewer runs than the run-count constant is reported as unmeasured"""
        runs = [True] * (arms.RUN_COUNT - 1)

        self.assertIsNone(arms.judge_runs(runs))

    def test_runs_agreeing_at_the_pass_threshold_set_compliance_either_way(self) -> None:
        agreeing = round(arms.RUN_COUNT * arms.PASS_THRESHOLD)
        dissenting = arms.RUN_COUNT - agreeing

        self.assertIs(arms.judge_runs([True] * agreeing + [False] * dissenting), True)
        self.assertIs(arms.judge_runs([False] * agreeing + [True] * dissenting), False)

    def test_runs_split_below_the_pass_threshold_yield_no_verdict(self) -> None:
        agreeing = round(arms.RUN_COUNT * arms.PASS_THRESHOLD) - 1
        dissenting = arms.RUN_COUNT - agreeing

        self.assertIsNone(arms.judge_runs([True] * agreeing + [False] * dissenting))

    def test_lowering_the_run_count_constant_changes_which_run_lists_get_a_verdict(self) -> None:
        """T-008 Lowering the run-count constant changes which results are reported as measured"""
        runs = [True] * (arms.RUN_COUNT - 1)
        self.assertIsNone(arms.judge_runs(runs))

        original_run_count = arms.RUN_COUNT
        try:
            arms.RUN_COUNT = len(runs)
            self.assertIs(arms.judge_runs(runs), True)
        finally:
            arms.RUN_COUNT = original_run_count


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
