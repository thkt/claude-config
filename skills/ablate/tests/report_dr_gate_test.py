"""Tests for the DR gate's place in skills/ablate/scripts/report.py's call sequence.

Run: python3 skills/ablate/tests/report_dr_gate_test.py

Each case runs the real dr_gate and report modules together, never a stub, so a change to
either cannot pass here unseen.
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


# The same string dr_gate_test.py uses, so both sides of the seam agree on the path.
CANDIDATE_PATH = "skills/sample/scripts/example.py"

# Governs CANDIDATE_PATH and carries a Reassessment Triggers section with no confirmation
# record, so a delete candidate traceable to it is held rather than passed.
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
        """T-004 report.py passes the verdict output through the DR gate before writing the
        report"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write(root, CANDIDATE_PATH, "# stand-in source\n")
            _write(root, "docs/decisions/0001-sample.md", DR_UNCONFIRMED)

            observations = _observations()

            # Fed directly, so the fixture is shown to exercise the hold path rather than
            # a DR-lookup miss.
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

                # Read off the written file, since a gate that ran after rendering would
                # still leave the held candidate in this section.
                delete_candidates_section = content.split("## Delete Candidates")[1]
                self.assertNotIn(f"- {CANDIDATE_PATH}", delete_candidates_section)
                self.assertIn("No delete candidates.", delete_candidates_section)


class HeldCandidateAbsentFromReport(unittest.TestCase):
    def test_a_delete_candidate_held_by_the_dr_gate_is_absent_from_the_reports_delete_candidates(
        self,
    ) -> None:
        """T-005 a delete candidate held by the DR gate is absent from the report's delete
        candidates"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write(root, CANDIDATE_PATH, "# stand-in source\n")
            _write(root, "docs/decisions/0001-sample.md", DR_UNCONFIRMED)

            observations = _observations()

            result = report.build_report(root, observations)

            # verdict.classify says DELETE_CANDIDATE on its own, so what keeps this path
            # out of delete_candidates is the gate, not a change to verdict.classify.
            direct_verdict = verdict.classify(
                trigger_task="task-a", task_set={"task-a"}, complies=True
            )
            self.assertEqual(direct_verdict, verdict.DELETE_CANDIDATE)

            self.assertNotIn(CANDIDATE_PATH, result["delete_candidates"])


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
