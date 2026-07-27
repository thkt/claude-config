"""Tests for workflows/audit/snapshot.py (deterministic audit-run recorder).

Run: python3 workflows/audit/tests/snapshot_test.py

compute_delta() is exercised directly; the CLI contract (stdin JSON -> a written
audit-*.json carrying resolved fields + delta, path on stdout, exit 1 on a bad
payload) is exercised via subprocess with an isolated HOME.
"""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "snapshot.py"
_spec = importlib.util.spec_from_file_location("snapshot", SCRIPT)
assert _spec is not None and _spec.loader is not None
snapshot = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(snapshot)


def raw(file, message):
    return {"file": file, "message": message}


class ComputeDeltaTest(unittest.TestCase):
    def test_first_run_when_no_prior_is_zero_with_note(self):
        self.assertEqual(
            snapshot.compute_delta([raw("a.rs", "x")], None),
            {"resolved": 0, "new": 0, "carried": 0, "note": "first run"},
        )

    def test_counts_resolved_new_and_carried_by_file_and_message(self):
        current = [raw("a.rs", "kept"), raw("b.rs", "fresh")]
        prior = [raw("a.rs", "kept"), raw("c.rs", "gone")]
        self.assertEqual(
            snapshot.compute_delta(current, prior),
            {"resolved": 1, "new": 1, "carried": 1},
        )

    def test_same_file_different_message_is_not_carried(self):
        current = [raw("a.rs", "new wording")]
        prior = [raw("a.rs", "old wording")]
        self.assertEqual(
            snapshot.compute_delta(current, prior),
            {"resolved": 1, "new": 1, "carried": 0},
        )

    def test_empty_current_against_prior_resolves_all(self):
        self.assertEqual(
            snapshot.compute_delta([], [raw("a.rs", "x"), raw("b.rs", "y")]),
            {"resolved": 2, "new": 0, "carried": 0},
        )


class CliTest(unittest.TestCase):
    def _run(self, payload, home):
        env = {"HOME": str(home), "PATH": ""}
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )

    def test_writes_record_with_resolved_fields_and_first_run_delta(self):
        with tempfile.TemporaryDirectory() as home:
            payload = {
                "scope": "HEAD",
                "focus": "all",
                "raw_findings": [raw("a.rs", "x")],
                "findings": [],
                "skipped": [],
            }
            result = self._run(payload, home)
            self.assertEqual(result.returncode, 0, result.stderr)
            out_path = Path(result.stdout.strip())
            self.assertTrue(out_path.exists())
            record = json.loads(out_path.read_text())
            self.assertEqual(record["branch"], "unknown")  # PATH="" -> no git
            self.assertIn("generated_at", record)
            self.assertEqual(record["delta"]["note"], "first run")

    def test_second_run_computes_delta_against_first(self):
        with tempfile.TemporaryDirectory() as home:
            first = {"raw_findings": [raw("a.rs", "keep"), raw("b.rs", "drop")]}
            self._run(first, home)
            second = {"raw_findings": [raw("a.rs", "keep"), raw("c.rs", "add")]}
            result = self._run(second, home)
            self.assertEqual(result.returncode, 0, result.stderr)
            record = json.loads(Path(result.stdout.strip()).read_text())
            self.assertEqual(
                record["delta"], {"resolved": 1, "new": 1, "carried": 1}
            )

    def test_unparseable_payload_exits_1_and_writes_nothing(self):
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
            history = Path(home) / ".claude" / "workspace" / "history"
            self.assertFalse(any(history.glob("audit-*.json")) if history.exists() else False)


if __name__ == "__main__":
    unittest.main()
