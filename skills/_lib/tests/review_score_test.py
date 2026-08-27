"""Tests for skills/_lib/review_score.py and the harness corpora it scores.

Run: python3 skills/_lib/tests/review_score_test.py
"""

import json
import re
import sys
import unittest
from pathlib import Path
from typing import cast

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))

from review_score import VERDICTS, Case, Previous, score  # noqa: E402

# Derived rather than listed: a harness added later would otherwise sit outside these checks until
# someone remembered to add its name here.
HARNESS_SKILLS = sorted(p.parents[1].name for p in ROOT.glob("skills/*/test/expected.json"))

HARNESS_DOC = ROOT / "skills" / "_lib" / "review-harness.md"


def verdict_set_section() -> str:
    """The '## Verdict set' section body, isolated from the schema section that follows it."""
    text = HARNESS_DOC.read_text(encoding="utf-8")
    after_heading = text.split("## Verdict set", 1)[1]
    return after_heading.split("## expected.json schema", 1)[0]


def flagged(file: str, category: str = "A03") -> Case:
    return {"file": file, "expected": "detected", "category": category, "severity_min": "high"}


def clean(file: str) -> Case:
    return {"file": file, "expected": "no_finding"}


def corpus(skill: str) -> list[Case]:
    path = ROOT / "skills" / skill / "test" / "expected.json"
    return cast(list[Case], json.loads(path.read_text(encoding="utf-8")))


class Scoring(unittest.TestCase):
    def test_recall_separates_flagging_the_file_from_catching_the_finding(self) -> None:
        report = score(
            [flagged("v1"), flagged("v2"), flagged("v3")],
            [
                {"file": "v1", "verdict": "hit"},
                {"file": "v2", "verdict": "below_severity"},
                {"file": "v3", "verdict": "other_finding"},
            ],
        )
        self.assertEqual(report["metrics"]["recall_detection"], 1.0)
        self.assertEqual(report["metrics"]["recall_expected"], 0.667)
        self.assertEqual(report["metrics"]["recall_strict"], 0.333)

    def test_the_fp_rate_counts_only_clean_cases_that_drew_a_finding(self) -> None:
        report = score(
            [flagged("v1"), clean("s1"), clean("s2")],
            [
                {"file": "v1", "verdict": "hit"},
                {"file": "s1", "verdict": "false_positive"},
                {"file": "s2", "verdict": "pass"},
            ],
        )
        self.assertEqual(report["counts"]["clean"], 2)
        self.assertEqual(report["metrics"]["fp_rate"], 0.5)

    def test_a_case_the_run_never_reported_counts_as_a_miss(self) -> None:
        """Dropping it would shrink the denominator and lift recall, hiding a regression."""
        report = score([flagged("v1"), flagged("v2")], [{"file": "v1", "verdict": "hit"}])
        self.assertEqual(report["counts"]["miss"], 1)
        self.assertEqual(report["metrics"]["recall_strict"], 0.5)

    def test_a_verdict_outside_the_closed_set_is_reported(self) -> None:
        """Every earlier log invented its own wording, which left the runs incomparable."""
        report = score([flagged("v1")], [{"file": "v1", "verdict": "full_hit"}])
        self.assertEqual(report["unknownVerdicts"], ["full_hit"])
        self.assertNotIn("full_hit", VERDICTS)

    def test_a_results_entry_carrying_the_new_verdict_is_counted_under_its_own_key_not_folded_into_hit_or_below_severity(
        self,
    ) -> None:
        report = score(
            [flagged("v1")],
            [{"file": "v1", "verdict": "below_min_findings"}],
        )
        self.assertEqual(report["counts"]["below_min_findings"], 1)
        self.assertEqual(report["counts"]["hit"], 0)
        self.assertEqual(report["counts"]["below_severity"], 0)

    def test_the_closed_set_check_accepts_the_new_verdict_and_still_rejects_a_verdict_outside_the_set(
        self,
    ) -> None:
        report = score(
            [flagged("v1"), flagged("v2")],
            [
                {"file": "v1", "verdict": "below_min_findings"},
                {"file": "v2", "verdict": "totally_unknown"},
            ],
        )
        self.assertIn("below_min_findings", VERDICTS)
        self.assertNotIn("below_min_findings", report["unknownVerdicts"])
        self.assertIn("totally_unknown", report["unknownVerdicts"])

    def test_per_category_recall_splits_the_strict_hits(self) -> None:
        report = score(
            [flagged("v1", "A03"), flagged("v2", "A03"), flagged("v3", "LLM01")],
            [
                {"file": "v1", "verdict": "hit"},
                {"file": "v2", "verdict": "miss"},
                {"file": "v3", "verdict": "miss"},
            ],
        )
        self.assertEqual(report["byCategory"]["A03"]["recall_strict"], 0.5)
        self.assertEqual(report["byCategory"]["LLM01"]["recall_strict"], 0.0)

    def test_a_previous_metric_written_as_prose_leaves_that_diff_empty(self) -> None:
        """Subtracting prose raised, which lost this run's numbers over a missing comparison."""
        report = score(
            [flagged("v1")],
            [{"file": "v1", "verdict": "hit"}],
            {"metrics": {"recall_strict": "58% (7/12)"}},
        )
        self.assertEqual(report["metrics"]["recall_strict"], 1.0)
        self.assertIsNone(report["diff"]["recall_strict"])

    def test_the_diff_against_a_previous_run_is_taken_per_metric(self) -> None:
        previous: Previous = {"metrics": {"recall_strict": 0.5, "fp_rate": 0.0}}
        report = score(
            [flagged("v1"), flagged("v2"), clean("s1")],
            [
                {"file": "v1", "verdict": "hit"},
                {"file": "v2", "verdict": "hit"},
                {"file": "s1", "verdict": "pass"},
            ],
            previous,
        )
        diff = report["diff"]
        assert diff is not None, "a previous run was passed, so a diff comes back"
        self.assertEqual(diff["recall_strict"], 0.5)
        self.assertEqual(diff["fp_rate"], 0.0)


class HarnessDocument(unittest.TestCase):
    def test_the_verdict_table_in_the_harness_document_and_the_verdicts_constant_carry_the_same_key_set(
        self,
    ) -> None:
        """A verdict added to the closed set that the doc's table forgets leaves a run silently unexplainable."""
        documented = set(re.findall(r"^\|\s*`(\w+)`", verdict_set_section(), re.MULTILINE))
        self.assertEqual(documented, set(VERDICTS.keys()))

    def test_the_harness_document_states_which_side_of_recall_strict_the_new_verdict_falls_on(
        self,
    ) -> None:
        """recall_strict stays hit / flagged; the doc must say the new verdict enters the
        denominator only, same as below_severity, rather than leaving readers to guess."""
        section = verdict_set_section()
        self.assertIn("below_min_findings", section)
        self.assertIn("recall_strict", section)
        self.assertIn("denominator", section)
        self.assertIn("numerator", section)


class Corpora(unittest.TestCase):
    def test_every_harness_carries_a_flag_case_and_a_clean_case(self) -> None:
        """A corpus of only flag cases measures recall while saying nothing about over-detection."""
        for skill in HARNESS_SKILLS:
            entries = corpus(skill)
            self.assertTrue(any(e["expected"] == "detected" for e in entries), skill)
            self.assertTrue(any(e["expected"] == "no_finding" for e in entries), skill)

    def test_every_case_file_an_expected_json_names_exists(self) -> None:
        """A stale path silently shrinks the run at the blind copy step."""
        for skill in HARNESS_SKILLS:
            for entry in corpus(skill):
                path = ROOT / "skills" / skill / "test" / str(entry["file"])
                self.assertTrue(path.exists(), f"{skill}: {entry['file']}")

    def test_every_flag_case_names_its_category(self) -> None:
        """Without a category the miss lands in a bucket that names no detection row to fix."""
        for skill in HARNESS_SKILLS:
            for entry in corpus(skill):
                if entry["expected"] == "detected":
                    self.assertTrue(entry.get("category"), f"{skill}: {entry['file']}")

    def test_the_scorer_reads_every_harness_corpus(self) -> None:
        for skill in HARNESS_SKILLS:
            entries = corpus(skill)
            report = score(entries, [])
            self.assertEqual(report["counts"]["flagged"] + report["counts"]["clean"], len(entries))
            self.assertEqual(report["counts"]["miss"], report["counts"]["flagged"], skill)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
