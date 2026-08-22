# pyright: reportUninitializedInstanceVariable=false
"""Tests for workflows/assert/record.py (deterministic assert-run recorder).

Run: python3 workflows/assert/tests/record_test.py

The CLI contract (stdin JSON -> one appended line in assert-runs.jsonl, {path} JSON on
stdout, exit 1 on a bad payload) is exercised via subprocess with an isolated HOME, so the
developer's own history file is never touched. Unlike build/record.py, assert is 1 run 1
line: no run_id is minted, and the row carries no defaults beyond what the payload supplies
plus generated_at.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import cast

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "record.py"

# Every row carries these, so a reader never branches on the kind of run.
ROW_FIELDS = {
    "gate",
    "gate_reason",
    "build",
    "tests",
    "mode",
    "issue_counts",
    "dropped_findings",
    "generated_at",
}

PAYLOAD = {
    "gate": "Ready",
    "gate_reason": ["build pass", "tests pass", "0 issues"],
    "build": "pass",
    "tests": "pass",
    "mode": "diff",
    "issue_counts": {"critical": 0, "high": 0, "medium": 0, "low": 0},
    "dropped_findings": 0,
}


def loaded(text: str) -> dict[str, object]:
    """A parsed JSON object. Anything else fails the test here rather than downstream."""
    value = cast("object", json.loads(text))
    assert isinstance(value, dict)
    return cast("dict[str, object]", value)


class CliTest(unittest.TestCase):
    def _run(self, payload: object, home: str) -> subprocess.CompletedProcess[str]:
        # PATH="" keeps the run off any git binary, so nothing the script resolves
        # depends on the checkout the test happens to run in.
        env = {"HOME": str(home), "PATH": ""}
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )

    def _lines(self, path: Path) -> list[dict[str, object]]:
        return [loaded(line) for line in path.read_text().splitlines() if line.strip()]

    def test_a_payload_on_stdin_appends_exactly_one_line_to_assert_runs_jsonl(self) -> None:
        """T-001: a payload on stdin appends exactly one line to assert-runs.jsonl."""
        with tempfile.TemporaryDirectory() as home:
            first = self._run(PAYLOAD, home)
            self.assertEqual(first.returncode, 0, first.stderr)
            out_path = Path(str(loaded(first.stdout)["path"]))
            self.assertEqual(out_path.name, "assert-runs.jsonl")
            self.assertEqual(len(self._lines(out_path)), 1)

            second = self._run(PAYLOAD, home)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(
                str(loaded(second.stdout)["path"]),
                str(out_path),
                "the file name is fixed, so a second run appends instead of writing beside it",
            )
            self.assertEqual(
                len(self._lines(out_path)),
                2,
                "assert is 1 run 1 line, so each call appends its own line rather than "
                "joining a prior one",
            )

    def test_the_appended_line_carries_the_full_row_field_set(self) -> None:
        """T-002: the appended line carries gate, gate_reason, build, tests, mode, the
        per-severity issue counts, dropped_findings and generated_at."""
        with tempfile.TemporaryDirectory() as home:
            result = self._run(PAYLOAD, home)
            self.assertEqual(result.returncode, 0, result.stderr)
            row = self._lines(Path(str(loaded(result.stdout)["path"])))[0]
            self.assertEqual(ROW_FIELDS - set(row.keys()), set())
            self.assertEqual(row["gate"], "Ready")
            self.assertEqual(row["gate_reason"], ["build pass", "tests pass", "0 issues"])
            self.assertEqual(row["build"], "pass")
            self.assertEqual(row["tests"], "pass")
            self.assertEqual(row["mode"], "diff")
            self.assertEqual(row["issue_counts"], {"critical": 0, "high": 0, "medium": 0, "low": 0})
            self.assertEqual(row["dropped_findings"], 0)
            self.assertIsInstance(row["generated_at"], str)
            self.assertTrue(cast("str", row["generated_at"]).endswith("Z"))

    def test_an_unparseable_payload_exits_1_and_writes_nothing(self) -> None:
        """T-003: an unparseable payload exits 1 and writes nothing."""
        with tempfile.TemporaryDirectory() as home:
            env = {"HOME": home, "PATH": ""}
            result = subprocess.run(
                [sys.executable, str(SCRIPT)],
                input="not json",
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stdout, "")
            self.assertFalse((Path(home) / ".claude" / "history" / "assert-runs.jsonl").exists())


if __name__ == "__main__":
    _ = unittest.main()
