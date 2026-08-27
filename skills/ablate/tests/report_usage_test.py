"""Tests for the usage counter's place in skills/ablate/scripts/report.py's call sequence.

Each case runs the real usage_counts and report modules together, never a stub, so a count
that report.py computes but never renders still fails here.

Run: python3 skills/ablate/tests/report_usage_test.py
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))
sys.path.insert(0, str(HERE.parent.parent / "_lib"))

import report  # noqa: E402
import usage_counts  # noqa: E402
import verdict  # noqa: E402

# The path RARE_BY_DESIGN ships with, so this case exercises the set the module really holds.
RARE_PATH = "hooks/security/rm_to_trash.py"


def _fire(command: str, timestamp: str) -> str:
    """One PreToolUse attachment record, the shape usage_counts_test.py's own fixture uses."""
    return json.dumps(
        {
            "type": "attachment",
            "attachment": {
                "type": "hook_success",
                "hookName": "PreToolUse:Bash",
                "hookEvent": "PreToolUse",
                "command": command,
                "stdout": "",
                "exitCode": 0,
            },
            "timestamp": timestamp,
        }
    )


def _transcripts(root: Path, records: list[str]) -> Path:
    path = root / "proj-a" / "session-1.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(records) + "\n", encoding="utf-8")
    return path


class TranscriptSummaryInReport(unittest.TestCase):
    def test_the_report_carries_the_parsed_transcript_count_and_its_date_range(self) -> None:
        """T-007 the report carries the parsed transcript count and its date range"""
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            repo_root = work / "repo"
            (repo_root / "hooks").mkdir(parents=True)
            (repo_root / "hooks" / "sample_hook.py").write_text("# fixture\n", encoding="utf-8")
            out_dir = work / "out"
            out_dir.mkdir()

            _transcripts(
                work / "transcripts",
                [
                    _fire("~/.claude/hooks/sample_hook.py", "2026-08-01T00:00:00.000Z"),
                    _fire("~/.claude/hooks/sample_hook.py", "2026-08-15T00:00:00.000Z"),
                ],
            )

            with patch.object(report, "TRANSCRIPTS_ROOT", work / "transcripts"):
                report_path = report.write_report(repo_root, [], out_dir=out_dir)

            summary = report_path.read_text(encoding="utf-8").split("## Harness Elements")[0]

        # Read off the Summary section alone: the dates also appear in the Harness Elements
        # table, so a whole-document search would pass with no Summary row at all.
        self.assertIn("| Transcripts parsed | 1 |", summary)
        self.assertIn("| Transcript date range | 2026-08-01 - 2026-08-15 |", summary)


class RareByDesignInReport(unittest.TestCase):
    def test_a_rare_by_design_element_with_zero_fires_stays_out_of_the_delete_candidates(
        self,
    ) -> None:
        """T-008 a rare-by-design element with zero fires stays out of the delete candidates"""
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            repo_root = work / "repo"
            repo_root.mkdir()
            _transcripts(work / "transcripts", [])

            # verdict.classify returns DELETE_CANDIDATE for this observation on its own, so
            # what keeps the path out of delete_candidates is the usage gate.
            observation = {
                "path": RARE_PATH,
                "trigger_task": "destructive-command",
                "task_set": {"destructive-command"},
                "complies": True,
            }
            self.assertEqual(
                verdict.classify(
                    trigger_task="destructive-command",
                    task_set={"destructive-command"},
                    complies=True,
                ),
                verdict.DELETE_CANDIDATE,
            )

            with patch.object(report, "TRANSCRIPTS_ROOT", work / "transcripts"):
                result = report.build_report(repo_root, [observation], now=date(2026, 8, 28))

        self.assertEqual(result["usage_verdicts"][RARE_PATH], usage_counts.NEEDS_HUMAN_JUDGMENT)
        self.assertNotIn(RARE_PATH, result["delete_candidates"])


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
