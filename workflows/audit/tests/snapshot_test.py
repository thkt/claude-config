# pyright: reportUninitializedInstanceVariable=false
"""Tests for workflows/audit/snapshot.py (deterministic audit-run recorder).

Run: python3 workflows/audit/tests/snapshot_test.py

The CLI contract (stdin JSON -> a written audit-*.json carrying resolved fields,
{path, counts} JSON on stdout, exit 1 on a bad payload) is exercised via
subprocess with an isolated HOME.
"""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import cast

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "snapshot.py"
_spec = importlib.util.spec_from_file_location("snapshot", SCRIPT)
assert _spec is not None and _spec.loader is not None
snapshot = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(snapshot)


def raw(file: str, message: str) -> dict[str, str]:
    return {"file": file, "message": message}


def loaded(text: str) -> dict[str, object]:
    """A parsed JSON object. Anything else fails the test here rather than downstream."""
    value = cast("object", json.loads(text))
    assert isinstance(value, dict)
    return cast("dict[str, object]", value)


# Copying the payload and its counts into each test body lets one side gain a key while the
# other stays behind, and nothing notices.
COUNTED_PAYLOAD = {
    "raw_findings": [raw("a.rs", "x"), raw("b.rs", "y")],
    "findings": [raw("a.rs", "root")],
    "skipped": [],
    "needs_context": [{"id": "R-2", "why": "unclear"}],
    "zero_reviewer_files": [],
}
COUNTED_PAYLOAD_COUNTS = {
    "raw_findings": 2,
    "findings": 1,
    "skipped": 0,
    "needs_context": 1,
    "zero_reviewer_files": 0,
}


class CliTest(unittest.TestCase):
    def _run(self, payload: object, home: str) -> subprocess.CompletedProcess[str]:
        env = {"HOME": str(home), "PATH": ""}
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )

    def test_writes_record_with_resolved_fields(self) -> None:
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
            out_path = Path(str(loaded(result.stdout)["path"]))
            self.assertTrue(out_path.exists())
            record = loaded(out_path.read_text())
            self.assertEqual(record["branch"], "unknown")  # PATH="" -> no git
            self.assertIn("generated_at", record)

    def test_stdout_reports_element_counts_of_what_was_written(self) -> None:
        """The caller compares against this output, not against what the agent says about itself.

        A payload reaches an agent only embedded in a prompt, and a summary made while copying it
        thins the record alone. Asking the agent for the counts hands the reporting to whoever did
        the trimming. Counting in the Python that received the stdin leaves no room for that.
        """
        with tempfile.TemporaryDirectory() as home:
            result = self._run(COUNTED_PAYLOAD, home)
            self.assertEqual(result.returncode, 0, result.stderr)
            out = loaded(result.stdout)
            self.assertEqual(out["counts"], COUNTED_PAYLOAD_COUNTS)
            self.assertTrue(Path(str(out["path"])).exists())

    def test_written_record_has_no_delta_key(self) -> None:
        """T-001: the written record carries no delta key."""
        with tempfile.TemporaryDirectory() as home:
            payload = {"raw_findings": [raw("a.rs", "x")]}
            result = self._run(payload, home)
            self.assertEqual(result.returncode, 0, result.stderr)
            record = loaded(Path(str(loaded(result.stdout)["path"])).read_text())
            self.assertNotIn("delta", record)

    def test_written_record_content_does_not_depend_on_prior_history(self) -> None:
        """T-002: a prior record in the history does not change the written record's content."""
        second_payload = {"raw_findings": [raw("a.rs", "keep"), raw("c.rs", "add")]}

        with tempfile.TemporaryDirectory() as home_with_prior:
            first_payload = {"raw_findings": [raw("a.rs", "keep"), raw("b.rs", "drop")]}
            _ = self._run(first_payload, home_with_prior)
            result_with_prior = self._run(second_payload, home_with_prior)
            record_with_prior = loaded(
                Path(str(loaded(result_with_prior.stdout)["path"])).read_text()
            )

        with tempfile.TemporaryDirectory() as home_without_prior:
            result_without_prior = self._run(second_payload, home_without_prior)
            record_without_prior = loaded(
                Path(str(loaded(result_without_prior.stdout)["path"])).read_text()
            )

        _ = record_with_prior.pop("generated_at", None)
        _ = record_without_prior.pop("generated_at", None)
        self.assertEqual(
            record_with_prior,
            record_without_prior,
            "a prior record must not change the content of the one written after it",
        )

    def test_stdout_still_reports_path_and_counts(self) -> None:
        """T-003: stdout still returns path and counts."""
        with tempfile.TemporaryDirectory() as home:
            result = self._run(COUNTED_PAYLOAD, home)
            self.assertEqual(result.returncode, 0, result.stderr)
            out = loaded(result.stdout)
            self.assertEqual(set(out.keys()), {"path", "counts"})
            self.assertEqual(out["counts"], COUNTED_PAYLOAD_COUNTS)
            self.assertTrue(Path(str(out["path"])).exists())

    def test_unparseable_payload_exits_1_and_writes_nothing(self) -> None:
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
    _ = unittest.main()
