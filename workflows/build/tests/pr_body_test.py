#!/usr/bin/env python3
"""Tests for workflows/build/pr-body.py (deterministic draft-PR fact renderer).

Run: python3 workflows/build/tests/pr_body_test.py

render() is exercised directly; the CLI contract (stdin JSON -> stdout markdown,
fail-closed exit 1 on a bad or incomplete payload) is exercised via subprocess.
"""

import importlib.util
import json
import subprocess
import sys
import unittest
from collections.abc import Mapping
from pathlib import Path
from typing import cast

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "pr-body.py"
# pr-body.py has a hyphen, so load it by path rather than import name.
_spec = importlib.util.spec_from_file_location("pr_body", SCRIPT)
assert _spec is not None and _spec.loader is not None
pr_body = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pr_body)


def render(payload: Mapping[str, object]) -> str:
    # Loaded by path because the filename has a hyphen, which leaves its attributes Any.
    return cast("str", pr_body.render(payload))  # pyright: ignore[reportAny]


def labels(language: str) -> dict[str, str]:
    """The label table for one language, read through the same cast as render."""
    table = cast("dict[str, dict[str, str]]", pr_body.LABELS)
    return table[language]


FULL: dict[str, object] = {
    "issue": "123",
    "scope_deviations": ["extra.js"],
    "missing_tests": ["rejects negative amounts"],
    "code_anomalies": [{"unit": "U-001", "kind": "no-red", "notes": "flaky"}],
    "tests_pass": True,
    "gates_pass": True,
    "verify_output": "",
    "conformance": [
        {
            "category": "missing",
            "severity": "high",
            "spec_line": "T-003 rejects negative",
            "location": "pay.js:12",
            "detail": "no test for T-003",
        }
    ],
}
CLEAN: dict[str, object] = {"issue": "9", "tests_pass": True, "gates_pass": True}


class RenderTest(unittest.TestCase):
    def test_closes_and_status_summary(self) -> None:
        # The status line is the <summary> of the folded tail: HTML <code> (markdown
        # does not render inside <summary>) so pass/FAIL stays visible while collapsed.
        body = render(FULL)
        self.assertIn("Closes #123", body)
        self.assertIn(
            "<summary><code>verify tests=pass gates=pass</code> · "
            + "<code>scope-deviations 1</code> · <code>missing-tests 1</code> · "
            + "<code>conformance 1 (1 high)</code></summary>",
            body,
        )

    def test_leads_with_auto_generated_label(self) -> None:
        # A reviewer who did not launch the build must be told the terse block below
        # is machine-generated, not hand-written by the author, how far its checking
        # goes, and what the visible status line is for.
        body = render(FULL)
        self.assertIn(
            "_Below is the build workflow's automated verification. It checks the "
            + "diff against the plan and does not hunt for code defects. It sits off "
            + "the PR's main thread, so reading it is optional. Open it when a "
            + "deviation count in the status line is non-zero._",
            body,
        )
        # The label leads the tail, above Closes.
        self.assertLess(body.index("automated verification"), body.index("Closes"))

    def test_no_command_invitation_is_printed(self) -> None:
        # Heavy assurance stays human-invoked, but the person reading this
        # tail is the one who launched the build, so the command hint is not repeated
        # on every PR. What the tail must still say is that no deep review happened.
        for payload in (FULL, CLEAN):
            body = render(payload)
            self.assertNotIn("/audit", body)
            self.assertNotIn("/polish", body)
            self.assertIn("does not hunt for code defects", body)

    def test_finding_counts_reach_the_summary_with_the_high_breakdown(self) -> None:
        # Deciding whether to open the fold happens on the summary alone. A count left
        # out of it goes unnoticed, and a bare count makes a wording nit and a gap that
        # defeats an acceptance criterion look like the same single finding.
        body = render(
            {
                **FULL,
                "conformance": [
                    {"category": "wrong", "severity": "high", "detail": "a"},
                    {"category": "wrong", "severity": "low", "detail": "b"},
                ],
                "structure": [{"category": "naming", "detail": "c"}],
            }
        )
        self.assertIn("<code>conformance 2 (1 high)</code>", body)
        self.assertIn("<code>structure 1</code>", body)

    def test_finding_counts_without_high_omit_the_breakdown(self) -> None:
        body = render(
            {**FULL, "conformance": [{"category": "wrong", "severity": "low", "detail": "a"}]}
        )
        self.assertIn("<code>conformance 1</code>", body)
        self.assertNotIn("high", body)

    def test_no_findings_keeps_the_summary_unchanged(self) -> None:
        # Parking "conformance 0" next to the three standing counts would add an item
        # carrying less information than the ones already there.
        body = render(CLEAN)
        self.assertNotIn("conformance 0", body)
        self.assertNotIn("structure", body)

    def test_lists_use_bold_labels_and_bullets(self) -> None:
        body = render(FULL)
        self.assertNotIn("Backlog", body)
        self.assertIn("**Files outside the plan's scope**", body)
        self.assertIn("- `extra.js`", body)
        self.assertIn("**Planned test statements not found**", body)
        self.assertIn("- rejects negative amounts", body)
        self.assertIn("**Anomalies (Red unconfirmed)**", body)
        self.assertIn("- U-001 (no-red): flaky", body)
        # build does not run the audit fan-out, so no residual section belongs here.
        self.assertNotIn("Unresolved", body)
        self.assertNotIn("re-audit", body)

    def test_untouched_plan_files_render_and_reach_the_summary(self) -> None:
        # A file the plan named but nothing touched is the trace of a unit that went
        # unimplemented and still passed. Inside the fold alone it goes unnoticed, so
        # it must reach the summary too.
        body = render({**FULL, "untouched_plan_files": ["app/schema.ts"]})
        self.assertIn("**Planned files never changed**", body)
        self.assertIn("- `app/schema.ts`", body)
        self.assertIn("<code>untouched-plan-files 1</code>", body)

    def test_untouched_plan_files_absent_keeps_the_summary_unchanged(self) -> None:
        # Adding it to the summary at zero would park an item carrying less information
        # than the three already there.
        self.assertNotIn("untouched-plan-files", render(FULL))

    def test_conformance_is_a_separate_section_not_in_deviation_counts(self) -> None:
        # reviewer-conformance's issue-axis findings surface in their own section and
        # must NOT be merged into the deterministic deviation counts.
        body = render(FULL)
        self.assertIn("**Issue conformance (review independently)**", body)
        self.assertIn("- `[high] missing` no test for T-003", body)
        self.assertIn("<code>scope-deviations 1</code>", body)

    def test_finding_leads_with_severity_and_sends_evidence_to_a_second_line(self) -> None:
        # severity reaches the reviewer (build.js counts high separately, so the body
        # must let high and trivial findings separate at a glance), and the location +
        # quoted spec sit on their own indented line instead of a trailing parenthesis.
        body = render(FULL)
        self.assertIn(
            "- `[high] missing` no test for T-003\n"
            + "  `pay.js:12` · spec: T-003 rejects negative",
            body,
        )

    def test_anomaly_folds_its_evidence_into_a_nested_details(self) -> None:
        # code.js splits the no-red report into a conclusion and an evidence list of
        # verbatim command output. That list buries the other anomalies' conclusions,
        # so it opens on demand while the summary keeps its line count visible.
        body = render(
            {
                **CLEAN,
                "code_anomalies": [
                    {
                        "unit": "U-001",
                        "kind": "no-red",
                        "notes": "the behavior is already implemented",
                        "evidence": [
                            "`src/slack.rs:120` classify delegates to from_reqwest",
                            "`cargo test --lib slack` -> 94 passed",
                        ],
                    }
                ],
            }
        )
        self.assertIn(
            "- U-001 (no-red): the behavior is already implemented\n"
            + "  <details><summary>2 evidence lines</summary>\n"
            + "\n"
            + "  - `src/slack.rs:120` classify delegates to from_reqwest\n"
            + "  - `cargo test --lib slack` -> 94 passed\n"
            + "\n"
            + "  </details>",
            body,
        )

    def test_anomaly_without_evidence_keeps_the_single_line_form(self) -> None:
        # scope-cut / uncommitted / reader-failed anomalies carry no evidence list. A
        # missing key must not add a blank continuation line under the conclusion.
        body = render(
            {**CLEAN, "code_anomalies": [{"unit": "U-002", "kind": "scope-cut", "notes": "x / y"}]}
        )
        self.assertIn("- U-002 (scope-cut): x / y\n", body)
        self.assertNotIn("x / y\n  \n", body)
        # An empty fold makes the reader open something with nothing inside it.
        self.assertNotIn("evidence lines", body)

    def test_finding_without_severity_leads_with_the_category_alone(self) -> None:
        # structure findings carry no severity; the lead must not render "[None]".
        body = render(
            {
                **CLEAN,
                "structure": [
                    {
                        "category": "hand_rolled",
                        "location": "ui/card.tsx:8",
                        "reference": "ui/panel.tsx:Frame",
                        "detail": "reimplements the shared frame",
                    }
                ],
            }
        )
        self.assertIn("**Structural deviations from the reference module**", body)
        self.assertIn(
            "- `[hand_rolled]` reimplements the shared frame\n"
            + "  `ui/card.tsx:8` · ref: ui/panel.tsx:Frame",
            body,
        )
        self.assertNotIn("None", body)

    def test_finding_without_evidence_omits_the_continuation_line(self) -> None:
        body = render({**CLEAN, "conformance": [{"category": "wrong", "detail": "diverges"}]})
        self.assertIn("- `[wrong]` diverges", body)
        self.assertNotIn("\n  ", body)

    def test_clean_run_omits_empty_sections_and_stays_short(self) -> None:
        body = render(CLEAN)
        self.assertNotIn("None", body)
        self.assertNotIn("**Assumptions", body)
        self.assertNotIn("**Files outside", body)
        self.assertNotIn("**Planned test statements", body)
        self.assertNotIn("**Issue conformance", body)
        self.assertNotIn("**Anomalies", body)
        self.assertIn("<code>scope-deviations 0</code> · <code>missing-tests 0</code>", body)
        non_empty = [ln for ln in body.splitlines() if ln.strip() and ln.strip() != "---"]
        # header label + Closes line + the status line
        self.assertEqual(len(non_empty), 3, non_empty)

    def test_clean_run_drops_the_fold_it_has_nothing_to_put_in(self) -> None:
        # An empty <details> asks the reviewer to open something with nothing behind
        # it. With nothing to fold, the status line stands on its own.
        body = render(CLEAN)
        self.assertNotIn("<details>", body)
        self.assertIn("<code>verify tests=pass gates=pass</code>", body)

    def test_verify_failure_uses_collapsed_details(self) -> None:
        body = render({**FULL, "tests_pass": False, "verify_output": "boom stacktrace"})
        self.assertIn("<code>verify tests=FAIL gates=pass</code>", body)
        self.assertIn("<details><summary>verify output</summary>", body)
        self.assertIn("```\nboom stacktrace\n```", body)

    def test_verify_output_containing_a_fence_does_not_break_out(self) -> None:
        # A test log that itself contains ``` must not terminate the code block early.
        log = "assert failed on:\n```\nfoo\n```\nend"
        body = render({**FULL, "gates_pass": False, "verify_output": log})
        # The chosen fence is longer than the longest backtick run in the log.
        self.assertIn("````\n" + log + "\n````", body)

    def test_verify_pass_has_no_nested_log_details(self) -> None:
        # FULL has sections to fold, so the outer fold is there; the nested
        # verify-output log is not.
        body = render(FULL)
        self.assertEqual(body.count("<details>"), 1)
        self.assertNotIn("verify output", body)
        self.assertNotIn("```", body)

    def test_verify_failure_without_output_keeps_the_status_line_visible(self) -> None:
        # A FAIL whose log is empty leaves nothing to fold, so the fold is dropped.
        # The FAIL itself must still be readable — it lives in the status line, which
        # is exactly what stays when the <details> goes away.
        body = render({**CLEAN, "tests_pass": False, "verify_output": ""})
        self.assertNotIn("<details>", body)
        self.assertIn("<code>verify tests=FAIL gates=pass</code>", body)

    def test_informational_content_is_inside_the_fold(self) -> None:
        # The header and Closes stay visible; every informational section collapses
        # below the status summary.
        body = render(FULL)
        opens = body.index("<summary>")
        closes = body.rindex("</details>")
        self.assertLess(body.index("Closes #123"), body.index("<details>"))
        for marker in ("**Planned test", "**Issue conformance", "**Anomalies"):
            self.assertLess(opens, body.index(marker), marker)
            self.assertLess(body.index(marker), closes, marker)

    def test_non_dict_item_degrades_instead_of_crashing(self) -> None:
        # A malformed (non-dict) list item must not raise and drop the whole tail.
        body = render({**CLEAN, "conformance": ["a bare string", None]})
        self.assertIn("**Issue conformance (review independently)**", body)
        self.assertIn("- a bare string", body)

    def test_list_item_newline_stays_on_one_line(self) -> None:
        body = render({**CLEAN, "missing_tests": ["line one\n# not a heading"]})
        self.assertIn("- line one # not a heading", body)
        self.assertNotIn("\n# not a heading", body)

    def test_leads_with_blank_line_and_rule_for_safe_append(self) -> None:
        self.assertTrue(render(FULL).startswith("\n\n---\n\n"))

    def test_japanese_translates_prose_labels_but_keeps_github_keyword(self) -> None:
        # language: japanese translates the human-facing section labels; the GitHub
        # magic keyword `Closes` and the `/audit` command name must stay verbatim.
        body = render({**FULL, "language": "japanese"})
        self.assertIn("Closes #123", body)
        self.assertIn("_下は build workflow の自動検証結果。", body)
        self.assertIn("**Plan スコープ外の変更ファイル**", body)
        self.assertIn("**テストとして見つからない plan の言明**", body)
        self.assertIn("**異常 (Red 未確認)**", body)
        self.assertIn("**Issue 適合性 (独立レビュー)**", body)
        self.assertIn("コードの欠陥を探すレビューはしていない", body)

    def test_unknown_language_falls_back_to_english(self) -> None:
        body = render({**FULL, "language": "klingon"})
        self.assertIn("**Planned test statements not found**", body)


class ConformanceOrderTest(unittest.TestCase):
    """render() ranks conformance by severity right after building the list, so a
    reviewer sees the highest-severity finding first regardless of payload order.
    structure keeps whatever order the payload gave it -- only conformance is ranked.
    """

    def test_conformance_findings_render_in_high_medium_low_order_when_the_payload_lists_them_low_first(
        self,
    ) -> None:
        body = render(
            {
                **CLEAN,
                "conformance": [
                    {"category": "a", "severity": "low", "detail": "low finding"},
                    {"category": "b", "severity": "medium", "detail": "medium finding"},
                    {"category": "c", "severity": "high", "detail": "high finding"},
                ],
            }
        )
        self.assertLess(body.index("high finding"), body.index("medium finding"))
        self.assertLess(body.index("medium finding"), body.index("low finding"))

    def test_conformance_findings_sharing_one_severity_keep_the_order_they_had_in_the_payload(
        self,
    ) -> None:
        # low sits between the two highs in the payload; a correct sort must move both
        # highs ahead of it while keeping "first high" before "second high" (sorted's
        # stability), not just leave the payload order untouched.
        body = render(
            {
                **CLEAN,
                "conformance": [
                    {"category": "a", "severity": "low", "detail": "low item"},
                    {"category": "b", "severity": "high", "detail": "first high"},
                    {"category": "c", "severity": "high", "detail": "second high"},
                ],
            }
        )
        self.assertLess(body.index("first high"), body.index("second high"))
        self.assertLess(body.index("second high"), body.index("low item"))

    def test_a_conformance_finding_with_no_severity_renders_after_every_finding_that_carries_one(
        self,
    ) -> None:
        body = render(
            {
                **CLEAN,
                "conformance": [
                    {"category": "a", "detail": "no severity finding"},
                    {"category": "b", "severity": "low", "detail": "low finding"},
                    {"category": "c", "severity": "high", "detail": "high finding"},
                ],
            }
        )
        self.assertLess(body.index("high finding"), body.index("no severity finding"))
        self.assertLess(body.index("low finding"), body.index("no severity finding"))

    def test_the_structure_section_keeps_the_order_the_payload_gave_it(self) -> None:
        # structure carries the same severity field as conformance but the contract
        # keeps it out of the rank sort, so a low-then-high payload must stay low-then-high.
        body = render(
            {
                **CLEAN,
                "structure": [
                    {"category": "a", "severity": "low", "detail": "structure low"},
                    {"category": "b", "severity": "high", "detail": "structure high"},
                ],
            }
        )
        self.assertLess(body.index("structure low"), body.index("structure high"))


class LabelTest(unittest.TestCase):
    def test_every_label_key_is_rendered(self) -> None:
        # A label whose producer is gone renders nothing, so no assertion on the output catches it.
        src = SCRIPT.read_text(encoding="utf-8")
        body = src[src.index("LABELS = {") :]
        body = body[body.index("}\n\n") :]
        for key in labels("english"):
            self.assertIn(key, body, f"{key} is a label nothing renders")

    def test_both_languages_carry_the_same_label_keys(self) -> None:
        self.assertEqual(
            sorted(labels("english")),
            sorted(labels("japanese")),
            "a label added to one language is added to the other",
        )


class CliTest(unittest.TestCase):
    def _run(self, stdin: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=stdin,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_stdin_to_stdout(self) -> None:
        proc = self._run(json.dumps(FULL))
        self.assertEqual(proc.returncode, 0)
        self.assertIn("Closes #123", proc.stdout)

    def test_invalid_json_fails_closed(self) -> None:
        proc = self._run("not json")
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(proc.stdout, "")

    def test_non_object_fails_closed(self) -> None:
        proc = self._run("[1,2,3]")
        self.assertEqual(proc.returncode, 1)

    def test_language_in_payload_is_honored_over_settings(self) -> None:
        # An explicit payload language wins, so the CLI output does not depend on the
        # machine's settings.json for this case.
        proc = self._run(json.dumps({**FULL, "language": "japanese"}))
        self.assertEqual(proc.returncode, 0)
        self.assertIn("テストとして見つからない plan の言明", proc.stdout)

    def test_missing_required_key_fails_closed(self) -> None:
        # A shipPayload that dropped a safety-critical key must not render a
        # plausible "clean" body — it must exit 1 so the caller's && chain aborts.
        for key in ("tests_pass", "gates_pass"):
            payload = {k: v for k, v in FULL.items() if k != key}
            proc = self._run(json.dumps(payload))
            self.assertEqual(proc.returncode, 1, f"missing {key} should fail closed")
            self.assertEqual(proc.stdout, "")


class CheckStatusTest(unittest.TestCase):
    """A check that did not run and a check that found nothing both count 0.

    The status line is where a reviewer decides whether to open the fold, so a check that
    never ran has to say so there rather than showing the same 0 a clean check shows.
    """

    def test_a_failed_scope_check_says_not_run_instead_of_zero(self) -> None:
        body = render({**CLEAN, "scope_status": "agent-failed", "scope_deviations": []})
        self.assertIn("<code>scope-deviations not run</code>", body)
        self.assertNotIn("<code>scope-deviations 0</code>", body)

    def test_a_failed_presence_check_says_not_run_instead_of_zero(self) -> None:
        body = render({**CLEAN, "test_presence_status": "agent-failed", "missing_tests": []})
        self.assertIn("<code>missing-tests not run</code>", body)

    def test_a_conformance_that_never_ran_reaches_the_status_line(self) -> None:
        # With no findings the cell is omitted, so without the status a dead reviewer is
        # indistinguishable from a clean review on the PR.
        body = render({**CLEAN, "conformance_status": "agent-failed", "conformance": []})
        self.assertIn("<code>conformance not run</code>", body)

    def test_a_conformance_that_found_no_spec_also_reads_as_not_run(self) -> None:
        # The agent answered, but with no spec to compare against nothing was reviewed.
        body = render({**CLEAN, "conformance_status": "no-spec", "conformance": []})
        self.assertIn("<code>conformance not run</code>", body)

    def test_nothing_to_check_keeps_the_cell_off_the_status_line(self) -> None:
        body = render({**CLEAN, "structure_status": "no-reference", "structure": []})
        self.assertNotIn("structure", body)

    def test_no_tests_in_the_plan_still_shows_the_count(self) -> None:
        body = render({**CLEAN, "test_presence_status": "no-tests", "missing_tests": []})
        self.assertIn("<code>missing-tests 0</code>", body)

    def test_a_payload_without_statuses_renders_as_before(self) -> None:
        self.assertIn("<code>scope-deviations 0</code>", render(CLEAN))

    def test_the_japanese_body_translates_the_not_run_label(self) -> None:
        body = render({**CLEAN, "language": "japanese", "scope_status": "agent-failed"})
        self.assertIn("<code>scope-deviations 未実行</code>", body)


if __name__ == "__main__":
    _ = unittest.main()
