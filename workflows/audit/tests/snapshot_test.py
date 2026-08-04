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

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "snapshot.py"
_spec = importlib.util.spec_from_file_location("snapshot", SCRIPT)
assert _spec is not None and _spec.loader is not None
snapshot = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(snapshot)


def raw(file, message):
    return {"file": file, "message": message}


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

    def test_writes_record_with_resolved_fields(self):
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
            out_path = Path(json.loads(result.stdout)["path"])
            self.assertTrue(out_path.exists())
            record = json.loads(out_path.read_text())
            self.assertEqual(record["branch"], "unknown")  # PATH="" -> no git
            self.assertIn("generated_at", record)

    def test_stdout_reports_element_counts_of_what_was_written(self):
        """呼び出し元が agent の自己申告でなくこの出力と照合できる。

        payload は prompt 埋め込みでしか agent に渡せず、書き写す途中で要約されると
        record だけが痩せる。件数を agent に自己申告させると、切り詰めた当人が
        報告することになる。stdin を受けた Python が数えれば agent は介在できない。
        """
        with tempfile.TemporaryDirectory() as home:
            payload = {
                "raw_findings": [raw("a.rs", "x"), raw("b.rs", "y")],
                "findings": [raw("a.rs", "root")],
                "skipped": [],
                "needs_context": [{"id": "R-2", "why": "unclear"}],
                "zero_reviewer_files": [],
            }
            result = self._run(payload, home)
            self.assertEqual(result.returncode, 0, result.stderr)
            out = json.loads(result.stdout)
            self.assertEqual(
                out["counts"],
                {
                    "raw_findings": 2,
                    "findings": 1,
                    "skipped": 0,
                    "needs_context": 1,
                    "zero_reviewer_files": 0,
                },
            )
            self.assertTrue(Path(out["path"]).exists())

    def test_written_record_has_no_delta_key(self):
        """T-001: 書き出された record に delta キーが無い。"""
        with tempfile.TemporaryDirectory() as home:
            payload = {"raw_findings": [raw("a.rs", "x")]}
            result = self._run(payload, home)
            self.assertEqual(result.returncode, 0, result.stderr)
            record = json.loads(Path(json.loads(result.stdout)["path"]).read_text())
            self.assertNotIn("delta", record)

    def test_written_record_content_does_not_depend_on_prior_history(self):
        """T-002: 履歴に prior record があっても、書き出された record の内容は prior に依存しない。"""
        second_payload = {"raw_findings": [raw("a.rs", "keep"), raw("c.rs", "add")]}

        with tempfile.TemporaryDirectory() as home_with_prior:
            first_payload = {"raw_findings": [raw("a.rs", "keep"), raw("b.rs", "drop")]}
            self._run(first_payload, home_with_prior)
            result_with_prior = self._run(second_payload, home_with_prior)
            record_with_prior = json.loads(
                Path(json.loads(result_with_prior.stdout)["path"]).read_text()
            )

        with tempfile.TemporaryDirectory() as home_without_prior:
            result_without_prior = self._run(second_payload, home_without_prior)
            record_without_prior = json.loads(
                Path(json.loads(result_without_prior.stdout)["path"]).read_text()
            )

        record_with_prior.pop("generated_at", None)
        record_without_prior.pop("generated_at", None)
        self.assertEqual(
            record_with_prior,
            record_without_prior,
            "prior の有無で record の内容が変わってはいけない",
        )

    def test_stdout_still_reports_path_and_counts(self):
        """T-003: stdout は path と counts を従来どおり返す。"""
        with tempfile.TemporaryDirectory() as home:
            payload = {
                "raw_findings": [raw("a.rs", "x"), raw("b.rs", "y")],
                "findings": [raw("a.rs", "root")],
                "skipped": [],
                "needs_context": [{"id": "R-2", "why": "unclear"}],
                "zero_reviewer_files": [],
            }
            result = self._run(payload, home)
            self.assertEqual(result.returncode, 0, result.stderr)
            out = json.loads(result.stdout)
            self.assertEqual(set(out.keys()), {"path", "counts"})
            self.assertEqual(
                out["counts"],
                {
                    "raw_findings": 2,
                    "findings": 1,
                    "skipped": 0,
                    "needs_context": 1,
                    "zero_reviewer_files": 0,
                },
            )
            self.assertTrue(Path(out["path"]).exists())

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
