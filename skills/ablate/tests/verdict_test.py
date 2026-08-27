"""Tests for skills/ablate/scripts/verdict.py.

Run: python3 skills/ablate/tests/verdict_test.py
"""

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))

from arms import UNMEASURED  # noqa: E402
from verdict import DELETE_CANDIDATE, NEEDS_HUMAN_JUDGMENT, classify  # noqa: E402


class Classification(unittest.TestCase):
    def test_an_element_that_complies_in_the_wiped_arm_is_reported_as_a_delete_candidate(
        self,
    ) -> None:
        """T-009 An element that complies in the wiped arm is reported as a delete candidate"""
        result = classify(trigger_task="task-a", task_set={"task-a"}, complies=True)

        self.assertEqual(result, DELETE_CANDIDATE)

    def test_wiped_arm_violation_needs_human_judgment(self) -> None:
        """T-010 An element that violates in the wiped arm is reported as needing a human
        value judgment"""
        result = classify(trigger_task="task-a", task_set={"task-a"}, complies=False)

        self.assertEqual(result, NEEDS_HUMAN_JUDGMENT)

    def test_no_input_produces_a_keep_verdict(self) -> None:
        """T-011 No input produces a keep verdict"""
        # skills/census/SKILL.md Phase 4's decision table is read top to bottom, first
        # matching row wins, and this unit's table places no `keep` row (contract: keep
        # の行は置かない). With nothing observed, the call must fall through to
        # UNMEASURED, never to a keep-shaped result.
        result = classify()

        self.assertEqual(result, UNMEASURED)
        self.assertNotEqual(result, "keep")
        self.assertFalse(hasattr(sys.modules["verdict"], "KEEP"))

    def test_an_element_whose_triggering_task_is_absent_from_the_task_set_is_reported_as_unmeasured(
        self,
    ) -> None:
        """T-012 An element whose triggering task is absent from the task set is reported as
        unmeasured"""
        # complies=True would earn DELETE_CANDIDATE on its own; the missing task_set
        # membership must win because its row sits above compliance in the table.
        result = classify(trigger_task="task-missing", task_set={"task-a", "task-b"}, complies=True)

        self.assertEqual(result, UNMEASURED)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
