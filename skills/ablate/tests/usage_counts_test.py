"""Tests for skills/ablate/scripts/usage_counts.py.

Run: python3 skills/ablate/tests/usage_counts_test.py

Fixture records follow the shape a real ~/.claude/projects/**/*.jsonl transcript carries for
a hook fire (confirmed by reading a live transcript in this session): a top-level "timestamp"
paired with an "attachment" object whose "hookEvent" is PreToolUse or PostToolUse and whose
"command" names the hook script that fired.
"""

import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))

import usage_counts  # noqa: E402
from arms import UNMEASURED  # noqa: E402
from verdict import DELETE_CANDIDATE  # noqa: E402


def _write_transcript(root: Path, rel: str, records: list[dict[str, object]]) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record) + "\n")
    return path


def _fire(*, event: str, command: str, timestamp: str) -> dict[str, object]:
    """One PreToolUse/PostToolUse attachment record."""
    return {
        "type": "attachment",
        "attachment": {
            "type": "hook_success",
            "hookName": f"{event}:Bash",
            "hookEvent": event,
            "command": command,
            "stdout": "",
            "exitCode": 0,
        },
        "timestamp": timestamp,
    }


class FireCounting(unittest.TestCase):
    def test_a_hook_fire_is_counted_from_a_pretooluse_record_in_a_session_transcript(
        self,
    ) -> None:
        """T-001 A hook fire is counted from a PreToolUse record in a session transcript"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_transcript(
                root,
                "project-a/session-1.jsonl",
                [
                    _fire(
                        event="PreToolUse",
                        command="hooks/pre-bash/wiki_scene.py",
                        timestamp="2026-08-01T00:00:00.000Z",
                    )
                ],
            )

            result = usage_counts.count_usage(root, now=date(2026, 8, 27))

            self.assertEqual(
                result["elements"]["hooks/pre-bash/wiki_scene.py"]["fires"], 1
            )


class RareByDesign(unittest.TestCase):
    def test_an_element_flagged_rare_by_design_is_not_reported_as_a_delete_candidate_at_zero_fires(
        self,
    ) -> None:
        """T-002 An element flagged rare-by-design is not reported as a delete candidate at
        zero fires"""
        # rules/PRINCIPLES.md Reuse Ordering / docs/wiki/harness-production-divergence.md:
        # the rare-by-design set is a script constant, so this test patches it rather than
        # relying on whatever paths usage_counts.py ships with.
        rare_path = "hooks/security/rm_to_trash.py"
        with patch.object(usage_counts, "RARE_BY_DESIGN", frozenset({rare_path})):
            verdict = usage_counts.classify(
                rare_path, fires=0, last_used=None, now=date(2026, 8, 27)
            )

        self.assertNotEqual(verdict, DELETE_CANDIDATE)


class MeasurementWindow(unittest.TestCase):
    def test_an_element_last_used_outside_the_measurement_window_is_reported_as_unmeasured(
        self,
    ) -> None:
        """T-003 An element last used outside the measurement window is reported as
        unmeasured"""
        # Lowering MEASUREMENT_WINDOW_DAYS must change which elements this reports as
        # unmeasured (issue #487 Testing Decisions: "計測窓の定数を動かすと、未計測として
        # 報告される要素が変わることを固定する"), so the window is patched rather than
        # hand-picked to already exceed whatever default the module ships with.
        with patch.object(usage_counts, "MEASUREMENT_WINDOW_DAYS", 30):
            stale_last_used = date(2026, 1, 1).isoformat()  # outside a 30-day window
            verdict = usage_counts.classify(
                "hooks/pre-bash/wiki_scene.py",
                fires=5,
                last_used=stale_last_used,
                now=date(2026, 8, 27),
            )

        self.assertEqual(verdict, UNMEASURED)


class TranscriptSummary(unittest.TestCase):
    def test_the_output_carries_the_parsed_transcript_count_and_its_date_range(
        self,
    ) -> None:
        """T-004 The output carries the parsed transcript count and its date range"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_transcript(
                root,
                "project-a/session-1.jsonl",
                [
                    _fire(
                        event="PreToolUse",
                        command="hooks/pre-bash/wiki_scene.py",
                        timestamp="2026-08-01T00:00:00.000Z",
                    )
                ],
            )
            _write_transcript(
                root,
                "project-b/session-2.jsonl",
                [
                    _fire(
                        event="PostToolUse",
                        command="hooks/post-bash/scribe_prompt.py",
                        timestamp="2026-08-10T00:00:00.000Z",
                    )
                ],
            )

            result = usage_counts.count_usage(root, now=date(2026, 8, 27))

            self.assertEqual(result["transcript_count"], 2)
            self.assertEqual(
                result["date_range"], {"start": "2026-08-01", "end": "2026-08-10"}
            )


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
