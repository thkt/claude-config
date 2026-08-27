"""Tests for skills/ablate/scripts/dr_gate.py.

Run: python3 skills/ablate/tests/dr_gate_test.py

This unit (issue #485 U-001) follows skills/census/SKILL.md Phase 3's DR cross-reference:
look up the DR that governs a given element path, then decide whether a delete candidate
traceable to that DR may pass. The judgment takes verdict.classify's output (issue #485's
"U-003") as its input verdict, so these tests feed dr_gate.gate the same DELETE_CANDIDATE
label verdict.py itself emits rather than a hand-rolled stand-in string.

DR lookup is a literal path search across docs/decisions/*.md under `root` (deterministic,
matching docs/wiki/deterministic-script-judgment.md: no DR maps a path to itself through any
machine-readable field yet, so grepping the DR body for the path text is the mechanical
substitute census Phase 3's candidate-to-DR cross-reference reduces to here).

A "confirmation record" that the Reassessment Triggers were checked and found not yet met is
this unit's own convention, introduced because no DR in the repository currently carries a
machine-checkable field for it (issue #485 Scope explicitly excludes rewriting DR bodies):
a line reading `Confirmed unmet: {date}` inside the DR file. Its absence is exactly the "no
confirmation record" state T-001 holds on.
"""

import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))

from verdict import DELETE_CANDIDATE  # noqa: E402

import dr_gate  # noqa: E402


def _write(root: Path, rel: str, content: str) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


CANDIDATE_PATH = "skills/sample/scripts/example.py"

# Governs CANDIDATE_PATH (the path appears in the Decision Outcome body), carries a
# Reassessment Triggers section, but no confirmation record.
DR_UNCONFIRMED = f"""\
# DR-0001 Sample decision

## Decision Outcome

Chosen option governs `{CANDIDATE_PATH}`.

## More Information

### Reassessment Triggers

- The upstream dependency changes its API.
"""

# Same DR, with a confirmation record stating the triggers were checked and found unmet.
DR_CONFIRMED_UNMET = f"""\
# DR-0001 Sample decision

## Decision Outcome

Chosen option governs `{CANDIDATE_PATH}`.

## More Information

### Reassessment Triggers

- The upstream dependency changes its API.

Confirmed unmet: 2026-08-20
"""

# Does not mention CANDIDATE_PATH anywhere, so it governs a different element entirely.
DR_UNRELATED = """\
# DR-0002 Unrelated decision

## Decision Outcome

Chosen option governs `skills/other/scripts/unrelated.py`.

## More Information

### Reassessment Triggers

- Some other condition.
"""


class Held(unittest.TestCase):
    def test_a_delete_candidate_traceable_to_a_dr_is_held_when_no_reassessment_triggers_record_is_present(
        self,
    ) -> None:
        """T-001 A delete candidate traceable to a DR is held when no Reassessment Triggers record is present"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write(root, CANDIDATE_PATH, "# stand-in source\n")
            _write(root, "docs/decisions/0001-sample.md", DR_UNCONFIRMED)

            result = dr_gate.gate(path=CANDIDATE_PATH, verdict=DELETE_CANDIDATE, root=root)

            self.assertEqual(result, dr_gate.HELD)


class Passes(unittest.TestCase):
    def test_a_delete_candidate_traceable_to_a_dr_passes_when_the_triggers_are_recorded_as_unmet(
        self,
    ) -> None:
        """T-002 A delete candidate traceable to a DR passes when the triggers are recorded as unmet"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write(root, CANDIDATE_PATH, "# stand-in source\n")
            _write(root, "docs/decisions/0001-sample.md", DR_CONFIRMED_UNMET)

            result = dr_gate.gate(path=CANDIDATE_PATH, verdict=DELETE_CANDIDATE, root=root)

            self.assertEqual(result, DELETE_CANDIDATE)
            self.assertNotEqual(result, dr_gate.HELD)

    def test_a_delete_candidate_with_no_matching_dr_passes_through_unchanged(self) -> None:
        """T-003 A delete candidate with no matching DR passes through unchanged"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write(root, CANDIDATE_PATH, "# stand-in source\n")
            # A DR directory exists and holds a DR, but none of them mention this path:
            # the lookup itself must come back empty, not merely "directory absent".
            _write(root, "docs/decisions/0002-unrelated.md", DR_UNRELATED)

            result = dr_gate.gate(path=CANDIDATE_PATH, verdict=DELETE_CANDIDATE, root=root)

            self.assertEqual(result, DELETE_CANDIDATE)
            self.assertNotEqual(result, dr_gate.HELD)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
