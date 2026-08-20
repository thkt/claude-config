"""Tests for skills/outcome/scripts/validate-outcome.py.

Run: python3 skills/outcome/tests/validate_outcome_test.py

The CLI contract (path argument -> stdout JSON, exit 1 only on errors) is
exercised via subprocess, since /outcome and its callers read the JSON.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import TypedDict, cast

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "validate-outcome.py"


class Report(TypedDict):
    file: str
    state: str
    flow: str
    errors: list[str]
    warnings: list[str]
    checks: list[str]


FILLED = """# OUTCOME

## Outcome state

### Behavior

- A reviewer reads the diff without asking what the change is for.

### Indicators

| Indicator  | Value              | Corroborates       |
| ---------- | ------------------ | ------------------ |
| Time       | under 10 min       | reviewer behavior  |
| Error rate | 0 reverted PRs     | reviewer behavior  |
| Value      | reviewer trusts it | reviewer behavior  |

## Non-goals

- Rewriting the release pipeline.

## Constraints

- GitHub Actions only.
"""

UNFILLED = """# OUTCOME

## Outcome state

### Behavior

TBD

## Non-goals

TBD

## Constraints

TBD
"""

NO_INDICATORS = """# OUTCOME

## Outcome state

### Behavior

- A user sees the total.

## Non-goals

- None.

## Constraints

- None.
"""


def run(path: Path) -> tuple[int, Report]:
    """(exit code, parsed stdout JSON) from one CLI invocation."""
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), str(path)],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode, cast(Report, json.loads(proc.stdout))


class ValidateOutcome(unittest.TestCase):
    def write(self, body: str) -> Path:
        tmp = Path(tempfile.mkdtemp()) / "OUTCOME.md"
        _ = tmp.write_text(body, encoding="utf-8")
        return tmp

    def test_filled_file_routes_to_update(self) -> None:
        code, out = run(self.write(FILLED))
        self.assertEqual(code, 0)
        self.assertEqual(out["state"], "ok")
        self.assertEqual(out["flow"], "update")
        self.assertEqual(out["errors"], [])
        self.assertEqual(out["warnings"], [])

    def test_absent_file_routes_to_generate(self) -> None:
        code, out = run(Path(tempfile.mkdtemp()) / "OUTCOME.md")
        self.assertEqual(code, 0)
        self.assertEqual(out["state"], "absent")
        self.assertEqual(out["flow"], "generate")
        self.assertIn("file=absent", out["checks"])

    def test_tbd_behavior_routes_to_generate(self) -> None:
        code, out = run(self.write(UNFILLED))
        self.assertEqual(code, 0)
        self.assertEqual(out["state"], "empty")
        self.assertEqual(out["flow"], "generate")
        self.assertIn("behavior=unfilled", out["checks"])
        self.assertIn("all_sections=unfilled", out["checks"])

    def test_filled_behavior_with_tbd_elsewhere_routes_to_update(self) -> None:
        body = UNFILLED.replace("### Behavior\n\nTBD", "### Behavior\n\n- A user sees the total.")
        code, out = run(self.write(body))
        self.assertEqual(code, 0)
        self.assertEqual(out["state"], "ok")
        self.assertEqual(out["flow"], "update")
        self.assertNotIn("all_sections=unfilled", out["checks"])

    def test_surviving_placeholder_is_an_error(self) -> None:
        body = FILLED.replace(
            "- A reviewer reads the diff without asking what the change is for.",
            "{Subject holds the named state in the done condition}",
        )
        code, out = run(self.write(body))
        self.assertEqual(code, 1)
        self.assertTrue(any(e.startswith("placeholder_left:") for e in out["errors"]))

    def test_inline_braces_in_prose_are_not_placeholders(self) -> None:
        """A Behavior naming a JSON shape must not read as an unfilled prompt."""
        body = FILLED.replace(
            "- A reviewer reads the diff without asking what the change is for.",
            "- The CLI returns {status, findings} without a wrapper.",
        )
        code, out = run(self.write(body))
        self.assertEqual(code, 0)
        self.assertIn("placeholder=none", out["checks"])

    def test_unfilled_indicator_cell_is_a_placeholder(self) -> None:
        body = FILLED.replace("| under 10 min       |", "| {bound}            |")
        code, out = run(self.write(body))
        self.assertEqual(code, 1)
        self.assertTrue(any(e.startswith("placeholder_left:") for e in out["errors"]))

    def test_missing_required_section_is_an_error(self) -> None:
        body = FILLED.replace("## Constraints\n\n- GitHub Actions only.\n", "")
        code, out = run(self.write(body))
        self.assertEqual(code, 1)
        self.assertIn("missing_section:Constraints", out["errors"])

    def test_omitted_indicators_draws_no_warning(self) -> None:
        code, out = run(self.write(NO_INDICATORS))
        self.assertEqual(code, 0)
        self.assertIn("indicators=omitted", out["checks"])
        self.assertEqual(out["warnings"], [])

    def test_incomplete_indicators_table_warns(self) -> None:
        body = FILLED.replace("| Value      | reviewer trusts it | reviewer behavior  |\n", "")
        code, out = run(self.write(body))
        self.assertEqual(code, 0)
        self.assertIn("missing_indicator:Value", out["warnings"])

    def test_bare_template_fails_until_filled(self) -> None:
        """The shipped template is the unfilled state, so it must not validate."""
        template = HERE.parent / "templates" / "outcome.md"
        code, out = run(template)
        self.assertEqual(code, 1)
        self.assertTrue(any(e.startswith("placeholder_left:") for e in out["errors"]))


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
