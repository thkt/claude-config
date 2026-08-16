"""Integration tests for hooks/pre-bash/issue_body_gate.py (PreToolUse hook).

Runs the hook as a real subprocess, pinning everything from the gh issue create extraction
through to the permissionDecision it returns. Wiring into settings.json is out of scope
(Manual verification covers that).

Run: python3 hooks/pre-bash/tests/issue_body_gate_test.py
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "issue_body_gate.py"
ROOT = Path(__file__).resolve().parents[3]

VALID_BUG_BODY = """## What & Why

Login fails for some users.

## Steps to Reproduce

1. Open app
2. Log in

## Expected vs Actual

- Expected: 200 OK
- Actual: 500 error

## Scope

- In scope: login flow
- Out of scope: signup flow
"""

# A body with "Expected vs Actual" dropped from the required sections of bug.md.
MISSING_SECTION_BUG_BODY = """## What & Why

Login fails for some users.

## Steps to Reproduce

1. Open app
2. Log in

## Scope

- In scope: login flow
- Out of scope: signup flow
"""

# A body carrying the section layout of feature.md (What & Why / Acceptance Criteria / Scope /
# Testing Decisions) in place of the required sections of bug.md.
FEATURE_SHAPED_BODY = """## What & Why

Add CSV export so users can analyze offline.

## Acceptance Criteria

- [ ] When user clicks Export, a .csv downloads

## Scope

- In scope: export flow
- Out of scope: import flow

## Testing Decisions

- Test the CSV serializer
"""


class TestIssueBodyGate(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory(prefix="issue-body-gate-")
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)

    # A res.error out of the subprocess call is raised, so "stdout is empty" never becomes a
    # false-positive green.
    #
    # separators without spaces: the hook's fast-exit greps the raw payload for the literal
    # `"tool_name":"Bash"`, which the default json.dumps spacing misses. Claude Code sends the
    # compact form, so this is what the hook actually receives.
    def run_hook(self, command, hook=None):
        payload = json.dumps(
            {"tool_name": "Bash", "tool_input": {"command": command}}, separators=(",", ":")
        )
        result = subprocess.run(
            [sys.executable, str(hook if hook else HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
        )
        stdout = result.stdout or ""
        try:
            out = json.loads(stdout) if stdout.strip() else None
        except json.JSONDecodeError:
            out = None
        return out, stdout, result.returncode

    def with_body_file(self, body, name="body.md"):
        directory = Path(tempfile.mkdtemp(dir=self.root))
        path = directory / name
        path.write_text(body, encoding="utf-8")
        return path

    def decision_of(self, out):
        return (out or {}).get("hookSpecificOutput", {}).get("permissionDecision")

    def reason_of(self, out):
        return (out or {}).get("hookSpecificOutput", {}).get("permissionDecisionReason", "")

    # The hook looks for a repository's own template first. With cwd left at this repository,
    # .github/ISSUE_TEMPLATE becomes the skeleton and breaks the premise that templates/bug.md
    # under the skill is what gets read.
    def bug_issue_cmd(self, body_path):
        return (
            f"cd {body_path.parent} && gh issue create "
            f'--title "[Bug] Login fails for some users" --body-file {body_path}'
        )

    def test_non_filing_commands_pass_through(self):
        """T-005 A Bash command other than gh issue create returns nothing and passes through"""
        # The second is not a filing, only a command carrying the same words in its arguments.
        # The third is a commit message where those words open a line of the body. Counting a
        # newline inside quotes as a command separator makes that line indistinguishable from a
        # filing.
        for command in (
            "gh issue list",
            'git commit -m "fix: gh issue create hook"',
            "git commit -m 'fix(hooks): stop a filing that skips the skeleton\n\n"
            'gh issue create --title "[Bug] x" --body-file /nonexistent/body.md now denies\'',
        ):
            with self.subTest(command=command):
                _, stdout, _ = self.run_hook(command)
                self.assertEqual(stdout.strip(), "", "returns something")

    def test_title_without_a_type_prefix_is_denied(self):
        """T-006 A filing whose title carries no type prefix pins no skeleton and is denied"""
        path = self.with_body_file(VALID_BUG_BODY)
        out, stdout, _ = self.run_hook(
            f'gh issue create --title "Login fails for some users" --body-file {path}'
        )
        with self.subTest("parses as JSON"):
            self.assertIsNotNone(out, f"stdout does not parse: {stdout!r}")
        with self.subTest("denies"):
            self.assertEqual(self.decision_of(out), "deny")
        with self.subTest("no top-level decision"):
            self.assertIsNone((out or {}).get("decision"))
        with self.subTest("the reason names the missing prefix"):
            self.assertIn("型プレフィックス", stdout)

    def test_inline_body_is_denied(self):
        """T-007 A filing whose body is given inline through --body is denied"""
        out, stdout, _ = self.run_hook(
            'gh issue create --title "[Bug] Login fails for some users" '
            '--body "Login fails for some users."'
        )
        with self.subTest("denies"):
            self.assertEqual(self.decision_of(out), "deny")
        with self.subTest("no top-level decision"):
            self.assertIsNone((out or {}).get("decision"))
        with self.subTest("the reason points at --body-file"):
            self.assertIn("--body-file", stdout)

    def test_body_missing_a_required_section_is_denied(self):
        """T-008 A filing whose body lacks a required section of the skeleton returns deny"""
        path = self.with_body_file(MISSING_SECTION_BUG_BODY)
        out, stdout, _ = self.run_hook(self.bug_issue_cmd(path))
        with self.subTest("hookEventName"):
            self.assertEqual(
                (out or {}).get("hookSpecificOutput", {}).get("hookEventName"), "PreToolUse"
            )
        with self.subTest("denies"):
            self.assertEqual(self.decision_of(out), "deny")
        with self.subTest("the reason names the missing section"):
            self.assertIn("missing_section:Expected vs Actual", self.reason_of(out))

    def test_feature_shaped_body_under_a_bug_title_is_denied(self):
        """T-009 Filing a feature-shaped body under a Bug title returns deny"""
        path = self.with_body_file(FEATURE_SHAPED_BODY)
        out, _, _ = self.run_hook(self.bug_issue_cmd(path))
        self.assertEqual(self.decision_of(out), "deny")

    def test_body_following_the_skeleton_passes(self):
        """T-010 A filing whose body follows the skeleton its title names passes without a deny"""
        path = self.with_body_file(VALID_BUG_BODY)
        out, stdout, status = self.run_hook(self.bug_issue_cmd(path))
        with self.subTest("exit 0"):
            self.assertEqual(status, 0, f"actual: {stdout!r}")
        with self.subTest("not denied"):
            self.assertNotEqual(self.decision_of(out), "deny")

    def test_assignment_on_a_separate_line_still_denies(self):
        """T-013 A filing with its assignment on a separate line still returns deny"""
        # Writing a filing, assigning the temp path to a variable before use is the natural shape.
        # A newline separates that assignment, putting `gh issue create` off the first line, so
        # this split-line form is what actually runs. The single-line T-008 passes straight
        # through it.
        path = self.with_body_file(MISSING_SECTION_BUG_BODY)
        command = "\n".join(
            [
                f"cd {path.parent}",
                f"B={path}",
                'gh issue create --title "[Bug] Login fails for some users" --body-file "$B"',
            ]
        )
        out, stdout, _ = self.run_hook(command)
        with self.subTest("parses as JSON"):
            self.assertIsNotNone(out, f"stdout does not parse: {stdout!r}")
        with self.subTest("denies"):
            self.assertEqual(self.decision_of(out), "deny")

    def test_unreadable_body_file_is_denied(self):
        """T-014 A filing whose --body-file points somewhere unreadable is denied"""
        # The hook holds no shell state, so it cannot expand `$B`. Letting it through unexpanded
        # would pass a filing whose body was never read, so an unreadable path falls to deny.
        out, stdout, _ = self.run_hook(
            'gh issue create --title "[Bug] Login fails" --body-file "$B"'
        )
        with self.subTest("denies"):
            self.assertEqual(self.decision_of(out), "deny")
        with self.subTest("the reason names --body-file"):
            self.assertIn("--body-file", stdout)

    def test_unterminated_quote_is_denied(self):
        """T-015 A command with an unterminated quote is denied even when the body follows the skeleton"""
        # Losing the split means passing a filing whose body was never read, with no way to tell
        # which fragment is the filing. An unterminated quote produces that state from real input.
        path = self.with_body_file(VALID_BUG_BODY)
        out, _, _ = self.run_hook(
            f'cd {path.parent} && gh issue create --title "[Bug] Login fails --body-file {path}'
        )
        self.assertEqual(self.decision_of(out), "deny")

    def test_filing_words_in_a_heredoc_body_do_not_deny(self):
        """T-024 The words of a filing command in a heredoc body do not draw a deny"""
        # A commit message passed through a heredoc has each body line scanned as a command line,
        # which denied a git commit whose body opened a line with gh issue create.
        message = self.root / "msg.txt"
        command = "\n".join(
            [
                f"cat > {message} << 'EOF'",
                "fix(hooks): 何かを直す",
                "",
                "gh issue create --title x を本文で説明している行",
                "EOF",
                f"git commit -F {message}",
            ]
        )
        _, stdout, _ = self.run_hook(command)
        self.assertEqual(stdout.strip(), "")

    def test_type_without_a_skeleton_is_denied(self):
        """T-016 A title naming a type with no skeleton cannot be matched and is denied"""
        # spike is a type with no skeleton in .github/ISSUE_TEMPLATE/ or skills/issue/templates/.
        path = self.with_body_file("## Nonsense\n\nx\n")
        out, stdout, _ = self.run_hook(
            f'cd {path.parent} && gh issue create --title "[Spike] 骨格を持たない型" '
            f"--body-file {path}"
        )
        with self.subTest("denies"):
            self.assertEqual(self.decision_of(out), "deny")
        with self.subTest("the reason names the type"):
            self.assertIn("spike", stdout)

    def test_a_validator_that_cannot_run_denies(self):
        """T-017 A validator that cannot run denies even a body following the skeleton"""
        # The hook finds lib, the skeleton, and the validator relative to its own location. A copy
        # holding lib and the skeleton but missing scripts passes the skeleton lookup and fails
        # only when it runs the validator.
        stage = Path(tempfile.mkdtemp(dir=self.root))
        (stage / "hooks" / "pre-bash").mkdir(parents=True)
        (stage / "skills" / "issue" / "templates").mkdir(parents=True)
        shutil.copytree(ROOT / "hooks" / "lib", stage / "hooks" / "lib")
        shutil.copy(
            ROOT / "skills" / "issue" / "templates" / "bug.md",
            stage / "skills" / "issue" / "templates" / "bug.md",
        )
        broken = stage / "hooks" / "pre-bash" / "broken.py"
        shutil.copy(HOOK, broken)
        broken.chmod(0o755)

        path = stage / "body.md"
        path.write_text(VALID_BUG_BODY, encoding="utf-8")
        out, _, _ = self.run_hook(
            f'cd {stage} && gh issue create --title "[Bug] Login fails for some users" '
            f"--body-file {path}",
            hook=broken,
        )
        self.assertEqual(self.decision_of(out), "deny")

    def test_repository_issue_form_becomes_the_skeleton(self):
        """T-012 With an issue form in the repository, that form's labels become the skeleton"""
        stage = Path(tempfile.mkdtemp(dir=self.root))
        form_dir = stage / ".github" / "ISSUE_TEMPLATE"
        form_dir.mkdir(parents=True)
        (form_dir / "bug.yml").write_text(
            "name: Bug report\n"
            "body:\n"
            "  - type: markdown\n"
            "    attributes:\n"
            "      value: Thanks for filing\n"
            "  - type: input\n"
            "    attributes:\n"
            "      label: Impact\n"
            "    validations:\n"
            "      required: true\n",
            encoding="utf-8",
        )
        # A body holding the form's labels alone, with none of the required sections of
        # templates/bug.md under the skill. With the form not chosen as the skeleton,
        # missing_section denies it.
        path = stage / "body.md"
        path.write_text("## Impact\n\nLogin is down for everyone.\n", encoding="utf-8")
        out, stdout, status = self.run_hook(
            f'cd {stage} && gh issue create --title "[Bug] Login is down" --body-file {path}'
        )
        with self.subTest("exit 0"):
            self.assertEqual(status, 0, f"actual: {stdout!r}")
        with self.subTest("not denied"):
            self.assertNotEqual(self.decision_of(out), "deny")

    def test_short_flag_title_is_read(self):
        """T-018 A title passed through the short flag -t still has its type prefix read"""
        # Failing to read -t denies it as "no type prefix" when the type is written right there.
        path = self.with_body_file(MISSING_SECTION_BUG_BODY)
        out, _, _ = self.run_hook(
            f'cd {path.parent} && gh issue create -t "[Bug] Login fails" --body-file {path}'
        )
        self.assertRegex(self.reason_of(out), re.compile("骨格と食い違う"))

    def test_short_flag_body_is_read(self):
        """T-019 A body passed through the short flag -F is still matched against the skeleton"""
        # Failing to read -F denies it as "--body given inline" when it came through a file.
        path = self.with_body_file(MISSING_SECTION_BUG_BODY)
        out, _, _ = self.run_hook(
            f'cd {path.parent} && gh issue create --title "[Bug] Login fails" -F {path}'
        )
        self.assertRegex(self.reason_of(out), re.compile("骨格と食い違う"))

    def test_relative_body_resolves_from_the_last_cd(self):
        """T-020 With several cd calls, a relative body path resolves from the last one"""
        # Taking the first cd looks for the body somewhere other than where it runs, and denies it
        # as unreadable.
        path = self.with_body_file(MISSING_SECTION_BUG_BODY)
        out, _, _ = self.run_hook(
            f'cd / && cd {path.parent} && gh issue create --title "[Bug] Login fails" '
            "--body-file body.md"
        )
        self.assertRegex(self.reason_of(out), re.compile("骨格と食い違う"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
