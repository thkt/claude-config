# pyright: reportUninitializedInstanceVariable=false
"""Tests for workflows/build/record.py (deterministic build-run recorder).

Run: python3 workflows/build/tests/record_test.py

The CLI contract (stdin JSON -> one appended line in build-runs.jsonl, {path, run_id}
JSON on stdout, exit 1 on a bad payload) is exercised via subprocess with an isolated
HOME, so the developer's own history file is never touched.
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

# The seven keys every row carries. A start row and a stop row read the same, so a reader
# counting stop reasons never has to branch on which kind of row it is looking at.
ROW_FIELDS = {
    "run_id",
    "issue",
    "repo",
    "branch",
    "reason",
    "plan_quality",
    "generated_at",
}

PAYLOAD = {
    "issue": "386",
    "repo": "/abs/target-repo",
    "branch": "feat/sample",
    "reason": "no-plan",
    "plan_quality": True,
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

    def test_appends_one_line_per_run(self) -> None:
        """T-001: a payload on stdin appends exactly one line to build-runs.jsonl."""
        with tempfile.TemporaryDirectory() as home:
            first = self._run(PAYLOAD, home)
            self.assertEqual(first.returncode, 0, first.stderr)
            out_path = Path(str(loaded(first.stdout)["path"]))
            self.assertEqual(out_path.name, "build-runs.jsonl")
            self.assertEqual(len(self._lines(out_path)), 1)

            second = self._run(PAYLOAD, home)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(
                str(loaded(second.stdout)["path"]),
                str(out_path),
                "the file name is fixed, so a second run appends instead of writing beside it",
            )
            self.assertEqual(len(self._lines(out_path)), 2)

    def test_appended_line_carries_every_row_field(self) -> None:
        """T-002: the line holds run_id, issue, repo, branch, reason, plan_quality, generated_at."""
        with tempfile.TemporaryDirectory() as home:
            result = self._run(PAYLOAD, home)
            self.assertEqual(result.returncode, 0, result.stderr)
            row = self._lines(Path(str(loaded(result.stdout)["path"])))[0]
            self.assertEqual(ROW_FIELDS - set(row.keys()), set())
            self.assertEqual(row["issue"], "386")
            self.assertEqual(row["reason"], "no-plan")
            self.assertEqual(row["plan_quality"], True)

    def test_minted_run_id_is_returned_and_differs_between_runs(self) -> None:
        """T-002: two runs within the same second get distinct run_ids, and stdout reports each."""
        with tempfile.TemporaryDirectory() as home:
            first = loaded(self._run(PAYLOAD, home).stdout)
            second = loaded(self._run(PAYLOAD, home).stdout)
            self.assertNotEqual(first["run_id"], second["run_id"])
            rows = self._lines(Path(str(first["path"])))
            self.assertEqual([row["run_id"] for row in rows], [first["run_id"], second["run_id"]])

    def test_supplied_run_id_is_kept(self) -> None:
        """T-002: a run_id in the payload ties the stop row to the start row of the same run."""
        with tempfile.TemporaryDirectory() as home:
            start = loaded(self._run({**PAYLOAD, "reason": "started"}, home).stdout)
            stop = loaded(self._run({**PAYLOAD, "run_id": start["run_id"]}, home).stdout)
            self.assertEqual(stop["run_id"], start["run_id"])
            rows = self._lines(Path(str(start["path"])))
            self.assertEqual({row["run_id"] for row in rows}, {start["run_id"]})

    def test_extra_keys_are_copied_verbatim(self) -> None:
        """T-002: nested_reason reaches the row, so a plan-caused stop inside code stays visible."""
        with tempfile.TemporaryDirectory() as home:
            result = self._run({**PAYLOAD, "nested_reason": "invalid-plan"}, home)
            row = self._lines(Path(str(loaded(result.stdout)["path"])))[0]
            self.assertEqual(row["nested_reason"], "invalid-plan")

    def test_unparseable_payload_exits_1_and_writes_nothing(self) -> None:
        """T-003: broken stdin exits 1 and leaves no file behind."""
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
            self.assertFalse((Path(home) / ".claude" / "history" / "build-runs.jsonl").exists())

    def test_non_object_payload_exits_1_and_writes_nothing(self) -> None:
        """T-003: valid JSON that is not an object is refused the same way."""
        with tempfile.TemporaryDirectory() as home:
            result = self._run(["not", "an", "object"], home)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stdout, "")
            self.assertFalse((Path(home) / ".claude" / "history" / "build-runs.jsonl").exists())


if __name__ == "__main__":
    _ = unittest.main()
