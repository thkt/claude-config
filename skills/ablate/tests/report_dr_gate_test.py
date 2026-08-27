"""Tests for the DR gate's place in skills/ablate/scripts/report.py's call sequence.

Run: python3 skills/ablate/tests/report_dr_gate_test.py

This is the seam unit for U-001 (skills/ablate/scripts/dr_gate.py) landing on top of
U-008's report.py call sequence (harness_elements -> arms -> verdict.classify -> render ->
write). This unit's contract places dr_gate.gate after verdict.classify's one-sided
judgment and before the report is written, so these tests exercise the real dr_gate module
together with the real report module (never a stub) the same way
skills/ablate/tests/report_test.py's EndToEnd and ApparatusSelfExclusion classes exercise
harness_elements / arms / verdict directly instead of a hand-rolled stand-in.
"""

import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))
sys.path.insert(0, str(HERE.parent.parent / "_lib"))

import dr_gate  # noqa: E402
import report  # noqa: E402
import verdict  # noqa: E402


def _write(root: Path, rel: str, content: str = "# content\n") -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


# A real skills/**/scripts/*.py harness-element path (skills/_lib/harness_elements.py
# POPULATION_GLOBS), the same string skills/ablate/tests/dr_gate_test.py already uses as
# its own CANDIDATE_PATH, so the DR body below and this element path agree on both sides
# of the seam.
CANDIDATE_PATH = "skills/sample/scripts/example.py"

# Governs CANDIDATE_PATH, carries a Reassessment Triggers section, but no confirmation
# record -- the exact fixture shape skills/ablate/tests/dr_gate_test.py's T-001 holds on,
# reused here so a delete candidate traceable to this DR is held rather than passed.
DR_UNCONFIRMED = f"""\
# DR-0001 Sample decision

## Decision Outcome

Chosen option governs `{CANDIDATE_PATH}`.

## More Information

### Reassessment Triggers

- The upstream dependency changes its API.
"""


def _observations() -> list[dict]:
    """One observation whose trigger_task/task_set/complies feed verdict.classify to
    DELETE_CANDIDATE (the same fixture values skills/ablate/tests/report_test.py's
    EndToEnd test uses), so the DR gate is the only thing standing between this element
    and the report's delete candidates."""
    return [
        {
            "path": CANDIDATE_PATH,
            "trigger_task": "task-a",
            "task_set": {"task-a"},
            "complies": True,
        }
    ]


class PassesThroughTheGateBeforeWriting(unittest.TestCase):
    def test_report_py_passes_the_verdict_output_through_the_dr_gate_before_writing_the_report(
        self,
    ) -> None:
        """T-004 report.py passes the verdict output through the DR gate before writing the report"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write(root, CANDIDATE_PATH, "# stand-in source\n")
            _write(root, "docs/decisions/0001-sample.md", DR_UNCONFIRMED)

            observations = _observations()

            # Sanity: fed directly, verdict.classify's own output is exactly what
            # dr_gate.gate holds for this fixture, confirming the fixture exercises the
            # hold path rather than a DR-lookup miss.
            direct_verdict = verdict.classify(
                trigger_task="task-a", task_set={"task-a"}, complies=True
            )
            self.assertEqual(direct_verdict, verdict.DELETE_CANDIDATE)
            self.assertEqual(
                dr_gate.gate(path=CANDIDATE_PATH, verdict=direct_verdict, root=root),
                dr_gate.HELD,
            )

            with tempfile.TemporaryDirectory() as out_tmp:
                out_dir = Path(out_tmp)
                report_path = report.write_report(root, observations, out_dir=out_dir)
                content = report_path.read_text(encoding="utf-8")

                # By the time the report file exists on disk, the DR gate must already
                # have run: the held candidate never reaches the written Delete
                # Candidates list, and the section reports none instead.
                delete_candidates_section = content.split("## Delete Candidates")[1]
                self.assertNotIn(f"- {CANDIDATE_PATH}", delete_candidates_section)
                self.assertIn("No delete candidates.", delete_candidates_section)


class HeldCandidateAbsentFromReport(unittest.TestCase):
    def test_a_delete_candidate_held_by_the_dr_gate_is_absent_from_the_reports_delete_candidates(
        self,
    ) -> None:
        """T-005 a delete candidate held by the DR gate is absent from the report's delete candidates"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write(root, CANDIDATE_PATH, "# stand-in source\n")
            _write(root, "docs/decisions/0001-sample.md", DR_UNCONFIRMED)

            observations = _observations()

            result = report.build_report(root, observations)

            # verdict.classify's raw, one-sided judgment says DELETE_CANDIDATE on its own
            # -- the DR gate is what must additionally hold this path back from
            # delete_candidates, not a change to verdict.classify itself.
            direct_verdict = verdict.classify(
                trigger_task="task-a", task_set={"task-a"}, complies=True
            )
            self.assertEqual(direct_verdict, verdict.DELETE_CANDIDATE)

            self.assertNotIn(CANDIDATE_PATH, result["delete_candidates"])


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
