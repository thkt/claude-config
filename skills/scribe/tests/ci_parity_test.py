"""Parity tests between .github/workflows/scribe.yml and its two contracts.

The tool set scribe.yml grants the claude step has to track skills/scribe/SKILL.md's
allowed-tools line (skill_contract_test.py already pins that line's shape), or a tool the
skill can call goes missing in CI while local /scribe keeps working. The trigger, gate, and
failure-report shapes come from issue #531's Plan for U-004; there is no prior file to read
them off, so this test is the only thing pinning them once scribe.yml exists.

Run: python3 skills/scribe/tests/ci_parity_test.py
"""

import re
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "scribe.yml"
SKILL = ROOT / "skills" / "scribe" / "SKILL.md"


def workflow_text() -> str:
    assert WORKFLOW.exists(), f"{WORKFLOW} does not exist yet"
    return WORKFLOW.read_text(encoding="utf-8")


def skill_allowed_tools() -> set[str]:
    """The canonical tool set: skills/scribe/SKILL.md line 5."""
    lines = SKILL.read_text(encoding="utf-8").split("\n")
    line = lines[4]
    assert line.startswith("allowed-tools:"), f"SKILL.md line 5 is not allowed-tools: {line!r}"
    return {tool for tool in line[len("allowed-tools:") :].split() if tool}


def on_block(text: str) -> str:
    """The indented body directly under the top-level `on:` key."""
    match = re.search(r"^on:\n((?:[ \t].*\n|\n)+)", text, re.MULTILINE)
    assert match is not None, "scribe.yml carries no on: block"
    return match.group(1)


def claude_step_window(text: str) -> str:
    """The claude-code-action step's own text plus a lookback, so an `if:` written either on
    the step itself or piggybacked onto a preceding line is still in view."""
    match = re.search(r"uses:\s*anthropics/claude-code-action", text)
    assert match is not None, "no anthropics/claude-code-action step"
    start = max(0, match.start() - 400)
    end = min(len(text), match.end() + 800)
    return text[start:end]


class ScribeWorkflowParity(unittest.TestCase):
    def test_scribe_yml_declares_the_same_tool_set_as_the_allowed_tools_line_of_skill_md(
        self,
    ) -> None:
        """T-007: scribe.yml declares the same tool set as the allowed-tools line of SKILL.md."""
        text = workflow_text()
        canonical = skill_allowed_tools()
        match = re.search(r"--allowedTools[= ]\"?([^\"\n]+)\"?", text)
        self.assertIsNotNone(match, "scribe.yml declares --allowedTools in claude_args")
        declared = {
            tool.strip() for tool in re.split(r"[,\s]+", match.group(1)) if tool.strip()
        }
        self.assertEqual(declared, canonical)

    def test_scribe_yml_triggers_are_merged_pull_request_close_schedule_and_workflow_dispatch_with_no_issues_trigger(  # noqa: E501
        self,
    ) -> None:
        """T-008: scribe.yml triggers are merged pull_request close, schedule, and
        workflow_dispatch, with no issues trigger."""
        text = workflow_text()
        block = on_block(text)
        self.assertIn("pull_request:", block, "on: declares pull_request")
        self.assertRegex(
            block,
            r"types:\s*(?:\[\s*closed\s*\]|\n\s*-\s*closed)",
            "pull_request is scoped to the closed type",
        )
        self.assertIn("schedule:", block, "on: declares schedule")
        self.assertIn("cron:", block, "schedule: carries a cron expression")
        self.assertIn("workflow_dispatch:", block, "on: declares workflow_dispatch")
        self.assertNotIn("issues:", block, "on: declares no issues trigger")
        self.assertIn(
            "github.event.pull_request.merged",
            text,
            "a merged check gates the closed pull_request run, since closed alone also fires "
            "on an unmerged close",
        )

    def test_the_claude_step_is_conditioned_on_the_gate_steps_should_run_output(self) -> None:
        """T-009: The claude step is conditioned on the gate step's should_run output."""
        text = workflow_text()
        self.assertRegex(
            text,
            r"id:\s*gate\b",
            "a step carries id: gate, which the claude step's condition addresses",
        )
        self.assertIn(
            "scribe_gate.py",
            text,
            "the gate step runs hooks/_lib/scribe_gate.py, U-003's should_run CLI",
        )
        window = claude_step_window(text)
        self.assertIn(
            "steps.gate.outputs.should_run",
            window,
            "the claude step's own if: (or the step wrapping it) reads the gate output",
        )

    def test_a_failure_conditioned_step_reports_to_a_fixed_tracking_issue(self) -> None:
        """T-010: A failure-conditioned step reports to a fixed tracking issue."""
        text = workflow_text()
        match = re.search(r"if:\s*failure\(\)([\s\S]{0,600})", text)
        self.assertIsNotNone(match, "a step is conditioned on if: failure()")
        following = match.group(1)
        self.assertIn(
            "gh issue comment",
            following,
            "the failure step reports via gh issue comment",
        )
        issue_ref = re.search(r"gh issue comment\s+(\d+)", following)
        self.assertIsNotNone(
            issue_ref,
            "the comment targets a fixed issue number, not one read from the triggering event",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
