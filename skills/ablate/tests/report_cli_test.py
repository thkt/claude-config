"""Tests for skills/ablate/scripts/report.py's CLI entry point.

report.py's own module docstring says it is "Not a CLI entry point" (SKILL.md imports
build_report/write_report instead), but this unit adds one anyway, mirroring
skills/ablate/scripts/usage_counts.py's own `main`. These tests drive the real script as a
subprocess rather than importing report.main, so a wiring gap between argv/exit-code/stdout
and the underlying functions shows up the same way it would for a real invocation.

Run: python3 skills/ablate/tests/report_cli_test.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS_DIR = HERE.parent / "scripts"
LIB_DIR = HERE.parent.parent / "_lib"
REPORT_PY = SCRIPTS_DIR / "report.py"


def _env(transcripts_root: Path) -> dict[str, str]:
    """The subprocess environment every case runs under. PYTHONPATH carries skills/_lib,
    matching enforcer_map.py's own "run with skills/_lib on PYTHONPATH" contract, since
    report.py imports harness_elements from there. ABLATE_TRANSCRIPTS_ROOT points usage
    counting at an empty directory so no case reads the real ~/.claude/projects tree."""
    merged = dict(os.environ)
    merged["PYTHONPATH"] = str(LIB_DIR)
    merged["ABLATE_TRANSCRIPTS_ROOT"] = str(transcripts_root)
    return merged


def _run(args: list[str], *, cwd: Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(REPORT_PY), *args],
        cwd=str(cwd),
        env=env,
        capture_output=True,
        text=True,
    )


class WritesReportAndPrintsPath(unittest.TestCase):
    def test_report_py_writes_the_report_for_an_observations_file_and_prints_the_written_path(
        self,
    ) -> None:
        """T-001 report.py writes the report for an observations file and prints the written
        path"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            root.mkdir()
            transcripts_root = Path(tmp) / "transcripts"
            transcripts_root.mkdir()
            observations_path = Path(tmp) / "observations.json"
            observations_path.write_text("[]", encoding="utf-8")

            result = _run(
                [str(observations_path)], cwd=root, env=_env(transcripts_root)
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            printed_path = Path(result.stdout.strip())
            self.assertTrue(
                printed_path.is_file(), f"printed path {printed_path!r} is not a written file"
            )
            self.assertIn(
                "# Ablation Report", printed_path.read_text(encoding="utf-8")
            )


class MissingObservationsArgument(unittest.TestCase):
    def test_report_py_exits_2_and_prints_usage_when_the_observations_argument_is_missing(
        self,
    ) -> None:
        """T-002 report.py exits 2 and prints usage when the observations argument is
        missing"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            transcripts_root = root / "transcripts"
            transcripts_root.mkdir()

            result = _run([], cwd=root, env=_env(transcripts_root))

            self.assertEqual(result.returncode, 2)
            self.assertIn("usage", result.stderr.lower())


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
