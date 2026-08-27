"""Tests for skills/ablate/scripts/report.py.

Run: python3 skills/ablate/tests/report_test.py

This is the seam unit for U-001 (skills/_lib/harness_elements.py) + U-002
(skills/ablate/scripts/arms.py) + U-003 (skills/ablate/scripts/verdict.py): report.py must
call the three real modules and wire their outputs together, so these tests exercise the
real modules directly (never a stub) and cross-check report.py's output against what those
real functions independently return for the same input. That is
skills/census/tests/verdict-and-paths.test.js's read-both-sides-and-cross-check shape applied
to the module boundary; MirrorParity below applies it to the EN/.ja language boundary.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))
sys.path.insert(0, str(HERE.parent.parent / "_lib"))

import arms  # noqa: E402
import harness_elements  # noqa: E402
import report  # noqa: E402
import verdict  # noqa: E402


def _write(root: Path, rel: str, content: str = "# content\n") -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


class EndToEnd(unittest.TestCase):
    def test_report_py_runs_the_real_enumerator_arms_and_verdict_scripts_end_to_end(
        self,
    ) -> None:
        """T-013 report.py runs the real enumerator, arms, and verdict scripts end to end"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # A real harness_elements.POPULATION_GLOBS member with no frontmatter, so
            # harness_elements.classify independently reports it ALWAYS_LOADED.
            _write(root, "rules/sample.md", "# Sample Rule\n\nNo frontmatter here.\n")

            observations = [
                {
                    "path": "rules/sample.md",
                    "trigger_task": "task-a",
                    "task_set": {"task-a"},
                    "complies": True,
                }
            ]

            result = report.build_report(root, observations)

            # Cross-check against the real enumerator instead of a hand-copied fixture:
            # a change to harness_elements.py must be visible here too.
            self.assertEqual(result["elements"], harness_elements.enumerate_elements(root))

            # Cross-check against the real arms module: report.py must expose every
            # defined arm, not a hardcoded subset.
            self.assertEqual(list(result["arms"]), list(arms.ARMS))

            # Cross-check against the real verdict module: the same inputs fed straight
            # to verdict.classify must produce the same label report.py records.
            expected_verdict = verdict.classify(
                trigger_task="task-a", task_set={"task-a"}, complies=True
            )
            self.assertEqual(expected_verdict, verdict.DELETE_CANDIDATE)
            self.assertEqual(result["verdicts"]["rules/sample.md"], expected_verdict)


class SecretRedaction(unittest.TestCase):
    def test_settings_json_env_values_are_absent_from_the_emitted_report(self) -> None:
        """T-014 settings.json env values are absent from the emitted report"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write(root, "rules/sample.md", "# Sample Rule\n\nNo frontmatter here.\n")
            secret_value = "sk-super-secret-value-should-never-print"
            settings = {"env": {"SECRET_TOKEN": secret_value}}
            _write(
                root,
                ".claude/settings.json",
                json.dumps(settings),
            )

            observations = [
                {
                    "path": "rules/sample.md",
                    "trigger_task": "task-a",
                    "task_set": {"task-a"},
                    "complies": True,
                    # The settings snapshot the run used, carried for provenance. Its env
                    # values must never reach the written report verbatim.
                    "settings": settings,
                }
            ]

            with tempfile.TemporaryDirectory() as out_tmp:
                out_dir = Path(out_tmp)
                report_path = report.write_report(root, observations, out_dir=out_dir)

                content = report_path.read_text(encoding="utf-8")

                self.assertNotIn(secret_value, content)


class ApparatusSelfExclusion(unittest.TestCase):
    def test_the_ablation_apparatus_itself_is_absent_from_the_delete_candidates(self) -> None:
        """T-015 The ablation apparatus itself is absent from the delete candidates"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # A stand-in for the ablate skill's own script tree, matching
            # harness_elements.POPULATION_GLOBS's "skills/**/scripts/*.py" the same way
            # the real skills/ablate/scripts/report.py does.
            apparatus_rel = "skills/ablate/scripts/report.py"
            _write(root, apparatus_rel, "# stand-in for the ablation apparatus\n")

            observations = [
                {
                    "path": apparatus_rel,
                    "trigger_task": "task-a",
                    "task_set": {"task-a"},
                    "complies": True,
                }
            ]

            # Fed directly, verdict.classify reports this element a delete candidate...
            direct_verdict = verdict.classify(
                trigger_task="task-a", task_set={"task-a"}, complies=True
            )
            self.assertEqual(direct_verdict, verdict.DELETE_CANDIDATE)

            # ...but report.py must never suggest deleting the apparatus that produced
            # the measurement, so the path is withheld from delete_candidates even though
            # its raw verdict is DELETE_CANDIDATE.
            result = report.build_report(root, observations)

            self.assertEqual(result["verdicts"][apparatus_rel], verdict.DELETE_CANDIDATE)
            self.assertNotIn(apparatus_rel, result["delete_candidates"])


MIRRORED_PAIRS = [
    ("skills/ablate/scripts/arms.py", ".ja/skills/ablate/scripts/arms.py"),
    ("skills/ablate/scripts/verdict.py", ".ja/skills/ablate/scripts/verdict.py"),
    ("skills/ablate/scripts/report.py", ".ja/skills/ablate/scripts/report.py"),
    ("skills/ablate/scripts/dr_gate.py", ".ja/skills/ablate/scripts/dr_gate.py"),
    ("skills/_lib/harness_elements.py", ".ja/skills/_lib/harness_elements.py"),
]

REPO_ROOT = HERE.parent.parent.parent


class MirrorParity(unittest.TestCase):
    """`.ja/` is canonical and the English side mirrors it in the same commit
    (rules/conventions/MIRROR.md). Prose differs between the two by design; the code
    structure does not, so a refactor landing on one side alone is what this catches."""

    def code_lines(self, path: Path) -> list[str]:
        """Statement lines with the prose dropped: comments go, and so does every line inside
        a docstring, which is what lets the two languages differ where they are meant to."""
        lines: list[str] = []
        in_doc = False
        for raw in path.read_text(encoding="utf-8").split("\n"):
            line = raw.strip()
            if in_doc:
                if line.endswith('"""'):
                    in_doc = False
                continue
            if line.startswith('"""'):
                if not (len(line) > 3 and line.endswith('"""')):
                    in_doc = True
                continue
            if not line or line.startswith("#"):
                continue
            lines.append(line)
        return lines

    def test_every_pair_carries_the_same_code_lines(self) -> None:
        for en_rel, ja_rel in MIRRORED_PAIRS:
            with self.subTest(en_rel):
                en, ja = REPO_ROOT / en_rel, REPO_ROOT / ja_rel
                self.assertTrue(ja.is_file(), f"{ja_rel} exists")
                self.assertEqual(
                    self.code_lines(en),
                    self.code_lines(ja),
                    f"{en_rel} and {ja_rel} carry different code",
                )


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
