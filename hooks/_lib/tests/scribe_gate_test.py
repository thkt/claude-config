"""Tests for hooks/_lib/scribe_gate.py.

Run: python3 hooks/_lib/tests/scribe_gate_test.py
"""

import os
import subprocess
import sys
import tempfile
import unittest
from collections.abc import Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import scribe_gate

GATE = Path(__file__).resolve().parent.parent / "scribe_gate.py"


class _QueueRunner:
    """Fake gh runner: hands back one canned stdout per call, in call order.

    Popping from an exhausted queue raises, which is what catches an implementation that
    keeps calling gh after the decision is already settled (mirrors
    hooks/_lib/tests/scribe_trigger_test.py's _QueueRunner).
    """

    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)

    def __call__(self, args: Sequence[str]) -> str:  # noqa: ARG002
        return self._responses.pop(0)


class TestShouldRun(unittest.TestCase):
    def test_an_unmerged_scribe_pr_yields_should_run_false(self) -> None:
        """T-003: An unmerged scribe PR yields should_run false."""
        runner = _QueueRunner(['[{"number": 1}]'])
        self.assertFalse(scribe_gate.should_run(runner=runner))

    def test_no_merged_pr_and_no_closed_issue_since_the_cursor_yields_should_run_false(
        self,
    ) -> None:
        """T-004: No merged PR and no closed issue since the cursor yields should_run false."""
        runner = _QueueRunner(["[]", "2026-01-01T00:00:00Z", "[]", "[]"])
        self.assertFalse(scribe_gate.should_run(runner=runner))

    def test_a_merged_pr_newer_than_the_cursor_yields_should_run_true(self) -> None:
        """T-005: A merged PR newer than the cursor yields should_run true."""
        runner = _QueueRunner(["[]", "2026-01-01T00:00:00Z", '[{"number": 5}]'])
        self.assertTrue(scribe_gate.should_run(runner=runner))


# Copied from hooks/post-bash/tests/scribe_prompt_test.py's GH_STUB: gh is the only external
# system should_run reaches, so only it stays faked while scribe_gate runs for real.
GH_STUB = """#!/usr/bin/env python3
import os
import pathlib
import sys

responses = pathlib.Path(os.environ["GH_STUB_RESPONSES"]).read_text(encoding="utf-8").split("\\n")
index_path = pathlib.Path(os.environ["GH_STUB_INDEX"])
i = int(index_path.read_text()) if index_path.is_file() else 0
index_path.write_text(str(i + 1))
sys.stdout.write(responses[i])
"""


class TestCli(unittest.TestCase):
    def test_run_as_a_script_the_cli_writes_the_should_run_line_into_the_file_github_output_points_at(
        self,
    ) -> None:
        """T-006: Run as a script, the CLI writes the should_run line into the file
        GITHUB_OUTPUT points at."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            stub_dir = root / "gh-stub"
            stub_dir.mkdir()
            stub = stub_dir / "gh"
            _ = stub.write_text(GH_STUB, encoding="utf-8")
            stub.chmod(0o755)
            responses_file = stub_dir / "responses"
            # A single unmerged-PR response is enough to settle should_run without a second
            # gh call, keeping this CLI-wiring test independent of TestShouldRun's cases.
            _ = responses_file.write_text('[{"number": 1}]', encoding="utf-8")
            output_file = root / "github-output"

            env = dict(
                os.environ,
                CLAUDE_GH_BIN=str(stub),
                GH_STUB_RESPONSES=str(responses_file),
                GH_STUB_INDEX=str(stub_dir / "index"),
                GITHUB_OUTPUT=str(output_file),
            )
            result = subprocess.run(
                [sys.executable, str(GATE)],
                capture_output=True,
                text=True,
                check=False,
                env=env,
                timeout=60,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(output_file.read_text(encoding="utf-8"), "should_run=false\n")


if __name__ == "__main__":
    unittest.main()
