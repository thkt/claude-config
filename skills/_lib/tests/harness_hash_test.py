"""Tests for skills/_lib/harness_hash.py and the freshness of the reviewer accuracy records.

Run: python3 skills/_lib/tests/harness_hash_test.py
"""

import json
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))

import harness_hash  # noqa: E402

SCRIPT = HERE.parent / "harness_hash.py"

# Derived rather than listed: a harness added later would otherwise wait for someone to name it.
HARNESS_SKILLS = sorted(p.parents[1].name for p in ROOT.glob("skills/*/test/expected.json"))


class Digest(unittest.TestCase):
    def test_the_order_files_arrive_in_does_not_change_the_digest(self) -> None:
        pairs = [("b.ts", b"second"), ("a.ts", b"first")]
        self.assertEqual(harness_hash._digest(pairs), harness_hash._digest(list(reversed(pairs))))

    def test_moving_content_between_two_files_changes_the_digest(self) -> None:
        one = [("a.ts", b"xy"), ("b.ts", b"")]
        other = [("a.ts", b"x"), ("b.ts", b"y")]
        self.assertNotEqual(harness_hash._digest(one), harness_hash._digest(other))

    def test_renaming_a_file_changes_the_digest(self) -> None:
        self.assertNotEqual(
            harness_hash._digest([("a.ts", b"same")]),
            harness_hash._digest([("b.ts", b"same")]),
        )


class SkillLookup(unittest.TestCase):
    def test_the_reviewer_name_drops_the_use_context_prefix(self) -> None:
        self.assertEqual(
            harness_hash.agent_name("use-context-reviewer-security"), "reviewer-security"
        )

    def test_every_harness_skill_resolves_to_a_reviewer_definition_and_a_body(self) -> None:
        for skill in HARNESS_SKILLS:
            with self.subTest(skill=skill):
                self.assertTrue(harness_hash.definition_path(skill).is_file())
                self.assertTrue(harness_hash.skill_path(skill).is_file())

    def test_a_record_added_under_results_does_not_move_the_corpus_hash(self) -> None:
        """A hash covering its own records could never be matched: writing one would move it."""
        skill = HARNESS_SKILLS[0]
        before = harness_hash.hashes(skill)
        results = ROOT / "skills" / skill / "test" / "results"
        results.mkdir(exist_ok=True)
        probe = results / "0000-00-00-hash-probe.json"
        probe.write_text("{}", encoding="utf-8")
        try:
            self.assertEqual(harness_hash.hashes(skill), before)
        finally:
            probe.unlink()

    def test_a_skill_with_no_definition_raises(self) -> None:
        with self.assertRaises(FileNotFoundError):
            harness_hash.hashes("use-context-reviewer-nonexistent")


class Cli(unittest.TestCase):
    def _run(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )

    def test_a_skill_name_prints_both_hashes(self) -> None:
        result = self._run(HARNESS_SKILLS[0])
        self.assertEqual(result.returncode, 0, result.stderr)
        printed = json.loads(result.stdout)
        self.assertEqual(sorted(printed), ["corpus_sha256", "definition_sha256", "skill_sha256"])

    def test_a_missing_argument_exits_2(self) -> None:
        self.assertEqual(self._run().returncode, 2)

    def test_an_unknown_skill_exits_1_and_prints_nothing_on_stdout(self) -> None:
        result = self._run("use-context-reviewer-nonexistent")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")


def newest_record(skill: str) -> Path | None:
    # Two runs on one date sort by the rest of the name, which is what review-harness.md asks a
    # same-day rerun to be named for.
    results = harness_hash.test_dir(skill) / "results"
    found = sorted(results.glob("*.json")) if results.is_dir() else []
    return found[-1] if found else None


class Freshness(unittest.TestCase):
    """The gate `rules/development/TESTING.md` § When a tier 1 run fires defines."""

    def test_every_harness_skill_has_a_record_of_a_run(self) -> None:
        missing = [s for s in HARNESS_SKILLS if newest_record(s) is None]
        self.assertEqual(
            missing,
            [],
            "no accuracy run recorded. Run skills/_lib/review-harness.md for each, or retire the "
            f"corpus with the skill: {', '.join(missing)}",
        )

    def test_the_newest_record_measured_the_reviewer_the_repository_ships(self) -> None:
        stale = []
        for skill in HARNESS_SKILLS:
            record_path = newest_record(skill)
            if record_path is None:
                continue
            record = json.loads(record_path.read_text(encoding="utf-8"))
            current = harness_hash.hashes(skill)
            for field, value in current.items():
                if record.get(field) != value:
                    stale.append(f"{skill}: {record_path.name} carries no matching {field}")
        self.assertEqual(
            stale,
            [],
            "the definition or the corpus moved after the run. Re-run the harness and record the "
            "hashes printed by harness_hash.py:\n" + "\n".join(stale),
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
