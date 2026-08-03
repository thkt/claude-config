"""Tests for workflows/audit/snapshot.py (deterministic audit-run recorder).

Run: python3 workflows/audit/tests/snapshot_test.py

compute_delta() is exercised directly; the CLI contract (stdin JSON -> a written
audit-*.json carrying resolved fields + delta, {path, counts} JSON on stdout,
exit 1 on a bad payload) is exercised via subprocess with an isolated HOME.
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


class BaselineSelectionTest(unittest.TestCase):
    """切り詰められた record を baseline に取ると delta が 2 回連続で壊れる。

    raw_findings は survived + needs_context + disputed なので、tally を持つ record では
    len(raw_findings) >= survived + needs_context が成り立つ。実測では raw 2 件に対し
    survived 21 の record が baseline になり、42 件すべてが new と報告された。
    """

    def _write(self, history_dir, name, payload):
        path = history_dir / f"audit-{name}.json"
        path.write_text(json.dumps(payload))
        return path

    def test_record_contradicting_its_own_tally_is_skipped_for_the_one_before_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            history = Path(tmp)
            self._write(
                history,
                "2026-08-02-100000",
                {"raw_findings": [raw("a.rs", "keep"), raw("b.rs", "keep2")]},
            )
            self._write(
                history,
                "2026-08-02-110000",
                {
                    "raw_findings": [raw("a.rs", "keep")],
                    "tally": {"survived": 21, "needs_context": 2, "no_verdict": 0},
                },
            )
            self.assertEqual(
                snapshot.latest_prior_raw(history),
                [raw("a.rs", "keep"), raw("b.rs", "keep2")],
                "矛盾した最新 record を飛ばし、その 1 つ前を baseline にする",
            )

    def test_record_whose_tally_matches_its_raw_findings_is_used(self):
        with tempfile.TemporaryDirectory() as tmp:
            history = Path(tmp)
            self._write(history, "2026-08-02-100000", {"raw_findings": [raw("old.rs", "x")]})
            self._write(
                history,
                "2026-08-02-110000",
                {
                    "raw_findings": [raw("a.rs", "keep"), raw("b.rs", "ctx"), raw("c.rs", "gone")],
                    "tally": {"survived": 1, "needs_context": 1, "no_verdict": 0},
                },
            )
            self.assertEqual(
                snapshot.latest_prior_raw(history),
                [raw("a.rs", "keep"), raw("b.rs", "ctx"), raw("c.rs", "gone")],
                "disputed の分だけ raw が tally を上回る record は正常なので baseline に使う",
            )

    def test_record_without_a_tally_is_used_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            history = Path(tmp)
            self._write(history, "2026-08-02-100000", {"raw_findings": [raw("a.rs", "x")]})
            self.assertEqual(
                snapshot.latest_prior_raw(history),
                [raw("a.rs", "x")],
                "照合する相手が無い record は判定対象にしない",
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
            out_path = Path(json.loads(result.stdout)["path"])
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
            record = json.loads(Path(json.loads(result.stdout)["path"]).read_text())
            self.assertEqual(
                record["delta"], {"resolved": 1, "new": 1, "carried": 1}
            )

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
