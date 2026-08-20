"""Tests for skills/scribe/scripts/triage.py.

Run: python3 skills/scribe/tests/triage_test.py
"""

import json
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Literal

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "triage.py"
sys.path.insert(0, str(SCRIPT.parent))

from triage import Pattern, triage  # noqa: E402

# The same three values triage branches on. A plain str here widens the literal and the helper
# stops building the shape the function accepts.
Existing = Literal["page", "candidate", "none"]


def pattern(name: str, count: int, existing: Existing = "none") -> Pattern:
    return {"name": name, "evidence": [f"#{name}{i}" for i in range(count)], "existing": existing}


class Triage(unittest.TestCase):
    def test_one_piece_of_evidence_stays_a_candidate(self) -> None:
        report = triage([pattern("a", 1)])
        self.assertEqual(report["pages"], [])
        self.assertEqual([c["action"] for c in report["candidates"]], ["candidate"])

    def test_a_first_sighting_backed_twice_becomes_a_page(self) -> None:
        """The invariant sets the bar at two, so a first sighting backed twice need not wait."""
        report = triage([pattern("a", 2)])
        self.assertEqual([(p["name"], p["action"]) for p in report["pages"]], [("a", "create")])

    def test_the_action_follows_where_the_pattern_already_lives(self) -> None:
        report = triage([pattern("a", 2, "page"), pattern("b", 2, "candidate")])
        self.assertEqual([p["action"] for p in report["pages"]], ["update", "promote"])

    def test_pages_past_the_cap_are_deferred_thinnest_evidence_first(self) -> None:
        """A run moving every qualifying pattern outgrows what one PR can be reviewed for."""
        report = triage([pattern("a", 2), pattern("b", 5), pattern("c", 3), pattern("d", 4)])
        self.assertEqual([p["name"] for p in report["pages"]], ["b", "d", "c"])
        self.assertEqual([p["name"] for p in report["deferred"]], ["a"])

    def test_candidates_do_not_consume_the_page_cap(self) -> None:
        """Candidates cost nothing to review, so counting them would starve the pages."""
        report = triage(
            [pattern("a", 1), pattern("b", 1), pattern("c", 2), pattern("d", 2), pattern("e", 2)]
        )
        self.assertEqual(len(report["pages"]), 3)
        self.assertEqual(len(report["candidates"]), 2)

    def test_the_cli_takes_the_array_on_argv_and_returns_the_three_groups(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), json.dumps([pattern("a", 2)])],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(sorted(json.loads(proc.stdout)), ["candidates", "deferred", "pages"])


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
