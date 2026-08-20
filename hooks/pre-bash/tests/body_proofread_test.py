# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/pre-bash/body_proofread.py (PreToolUse hook).

Run: python3 hooks/pre-bash/tests/body_proofread_test.py
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import override

HOOK = Path(__file__).resolve().parents[1] / "body_proofread.py"

# ≥50 Japanese chars (has_japanese threshold) with a deterministic finding (redundant expression)
LINTED_BODY = "この機能はユーザーが設定を変更することができます。この説明は日本語判定の五十文字閾値を超えるための追加の文章です。"

# The second line carries enough commas to trip max-ten, so a heredoc commit draws a finding.
COMMIT_BODY = "fix(hooks): 処理を行うことが出来ます\n\nこれは、テスト、です、が、読点、が、多すぎ、ます。"

FINDINGS = "textlint 校正結果"
CHECKLIST = "構造レビュー"


class TestBodyProofread(unittest.TestCase):
    # Declared here because setUp fills them: an attribute first seen inside a method
    # carries no type for a checker.
    tmpdir: tempfile.TemporaryDirectory[str]
    root: Path

    @override
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory(prefix="body-proofread-tests-")
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)

    def run_hook(
        self,
        command: str | None,
        tool: str = "Bash",
        tool_input: dict[str, str] | None = None,
        env: dict[str, str] | None = None,
    ) -> str:
        payload = json.dumps({"tool_name": tool, "tool_input": tool_input or {"command": command}})
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )
        return result.stdout

    def with_body_file(self, name: str = "plain") -> Path:
        directory = self.root / name
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "body.md"
        _ = path.write_text(LINTED_BODY + "\n", encoding="utf-8")
        return path

    def heredoc_commit(self, body: str, *, delimiter: str) -> str:
        """A git commit whose message arrives through a heredoc."""
        return f'git commit -m "$(cat <<{delimiter}\n{body}\nEOF\n)"'

    def assert_all_in(self, output: str, *phrases: str) -> None:
        for phrase in phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, output)

    def test_issue_create_advisory(self) -> None:
        """T-006 A gh issue create whose body draws findings returns the textlint findings"""
        out = self.run_hook(f'gh issue create --title "test" --body "{LINTED_BODY}"')
        self.assert_all_in(out, "hookSpecificOutput", "PreToolUse", FINDINGS, CHECKLIST)
        with self.subTest("no top-level decision"):
            self.assertNotIn('"decision"', out)
        # A real newline encodes as \n in JSON, an unexpanded one as \\n.
        with self.subTest("newlines are expanded"):
            self.assertNotIn("\\\\n", out)

    def test_issue_create_body_file(self) -> None:
        """T-020 The body a gh issue create --body-file points at is proofread"""
        path = self.with_body_file("issue")
        out = self.run_hook(f'gh issue create --title "test" --body-file {path}')
        self.assert_all_in(out, FINDINGS, CHECKLIST)

    def test_pr_create_body_file(self) -> None:
        """T-021 The body a gh pr create --body-file points at is proofread"""
        path = self.with_body_file("pr")
        self.assertIn(FINDINGS, self.run_hook(f'gh pr create --title "test" --body-file {path}'))

    def test_quoted_body_file(self) -> None:
        """T-023 A --body-file path wrapped in quotes is read too"""
        path = self.with_body_file("with space")
        out = self.run_hook(f'gh issue create --title "test" --body-file "{path}"')
        self.assertIn(FINDINGS, out)

    def test_relative_body_file_without_cd_skipped(self) -> None:
        """T-022 A relative --body-file with no cd is not proofread"""
        # The command carries nothing to resolve it with, and the hook holds no cwd for where
        # the command runs.
        out = self.run_hook('gh issue create --title "test" --body-file body.md')
        self.assertEqual(out, "")

    def test_relative_body_file_after_cd_is_read(self) -> None:
        """T-028 A relative --body-file with a cd is proofread"""
        # The cd names where it resolves, so proofreading lands as it would on an absolute path.
        # Left unread, the skeleton check alone passes and the proofreading quietly drops out.
        directory = self.root / "rel"
        directory.mkdir()
        _ = (directory / "body.md").write_text(
            "## What & Why\n\nこれは、テストの本文です。適切に処理する。\n", encoding="utf-8"
        )
        out = self.run_hook(f'cd {directory} && gh issue create --title "test" --body-file body.md')
        self.assertIn(CHECKLIST, out)

    def test_issue_create_clean(self) -> None:
        """T-007 A gh issue create whose body draws no finding returns the structure review alone"""
        out = self.run_hook('gh issue create --title "test" --body "テストです。"')
        self.assert_all_in(out, CHECKLIST, "additionalContext")
        with self.subTest("no textlint findings"):
            self.assertNotIn(FINDINGS, out)

    def test_tmpdir_trailing_slash(self) -> None:
        """T-019 A trailing slash on TMPDIR leaves no temp path in the findings"""
        # The TMPDIR macOS hands over ends in a slash. The environment running this may already
        # be in that shape, so two are added and the stripping is watched past the first.
        env = dict(os.environ, TMPDIR=os.environ.get("TMPDIR", "/tmp") + "//")
        out = self.run_hook(f'gh issue create --title "test" --body "{LINTED_BODY}"', env=env)
        with self.subTest("has textlint findings"):
            self.assertIn(FINDINGS, out)
        with self.subTest("no temp file path"):
            self.assertNotIn("body.md", out)

    def test_non_gh_command_skipped(self) -> None:
        """T-008 git status is out of scope"""
        self.assertEqual(self.run_hook("git status"), "")

    def test_pr_create_advisory(self) -> None:
        """T-010 A gh pr create whose body draws findings returns an advisory"""
        out = self.run_hook(f'gh pr create --title "test" --body "{LINTED_BODY}"')
        self.assert_all_in(out, "additionalContext", FINDINGS)

    def test_pr_create_multiline_body(self) -> None:
        """T-015 A gh pr create with a multiline body is proofread too"""
        body = (
            "一行目は複数行の本文が正しく抽出されることを確認する文です。\n"
            + "これは、二行目、で、読点、が、多す、ぎます。\n"
            + "三行目は日本語判定の五十文字閾値を確実に超えるための追加の文章です。"
        )
        out = self.run_hook(f'gh pr create --title "test" --body "{body}"')
        self.assert_all_in(out, FINDINGS, "max-ten")

    def test_commit_heredoc_advisory(self) -> None:
        """T-016 A heredoc commit message returns an advisory with no structure review"""
        out = self.run_hook(self.heredoc_commit(COMMIT_BODY, delimiter="'EOF'"))
        self.assert_all_in(out, FINDINGS, "commit message")
        with self.subTest("no structure checklist for commit"):
            self.assertNotIn(CHECKLIST, out)

    def test_commit_bare_heredoc_advisory(self) -> None:
        """T-024 A commit message written with an unquoted delimiter is proofread too"""
        # Reading the quoted <<'EOF' alone reads <<EOF as carrying no body, and the
        # proofreading quietly drops out.
        out = self.run_hook(self.heredoc_commit(COMMIT_BODY, delimiter="EOF"))
        self.assert_all_in(out, FINDINGS, "commit message")

    def test_commit_message_file_advisory(self) -> None:
        """T-025 The body a git commit -F points at is proofread too"""
        path = self.with_body_file("commit")
        out = self.run_hook(f"git commit -F {path}")
        with self.subTest("has textlint findings"):
            self.assertIn(FINDINGS, out)
        with self.subTest("no structure checklist for commit"):
            self.assertNotIn(CHECKLIST, out)

    def test_short_flags_advisory(self) -> None:
        """T-026 A body passed through the short flags (-b / -F) is proofread too"""
        path = self.with_body_file("short")
        with self.subTest("-F is read"):
            self.assertIn(FINDINGS, self.run_hook(f'gh issue create --title "test" -F {path}'))
        with self.subTest("-b is read"):
            self.assertIn(
                FINDINGS, self.run_hook(f'gh issue create --title "test" -b "{LINTED_BODY}"')
            )

    def test_unrelated_heredoc_is_not_the_body(self) -> None:
        """T-027 A heredoc writing another file before the filing is not read as the body"""
        # Preferring the heredoc unconditionally proofreads that file instead of the issue body.
        # Findings appear either way, so the two become indistinguishable in the output.
        path = self.with_body_file("heredoc")
        cmd = (
            "cat > /tmp/patch.py <<'PY'\n"
            + "これは、無関係、な、ファイル、の、中身、です。\nPY\n"
            + f'gh issue create --title "test" --body-file {path}'
        )
        out = self.run_hook(cmd)
        # Findings never quote their source text, so the rule name is what tells the two apart:
        # the body draws a redundant expression (dict2), the heredoc a comma count (max-ten).
        with self.subTest("lints the body file"):
            self.assertIn("dict2", out)
        with self.subTest("not the heredoc content"):
            self.assertNotIn("max-ten", out)

    def test_commit_inline_advisory(self) -> None:
        """T-017 Findings in a git commit -m body return an advisory"""
        out = self.run_hook('git commit -m "fix: これは、読点、が、多い、修正、です。"')
        self.assertIn(FINDINGS, out)

    def test_commit_clean_silent(self) -> None:
        """T-018 A commit message drawing no finding returns nothing"""
        out = self.run_hook('git commit -m "fix(hooks): commit message の textlint 対応を追加する"')
        self.assertEqual(out, "")

    def test_non_bash_tool_skipped(self) -> None:
        """T-012 The Write tool is out of scope"""
        out = self.run_hook(None, tool="Write", tool_input={"file_path": "/some/file.md"})
        self.assertEqual(out, "")

    def test_no_body_skipped(self) -> None:
        """T-013 A gh issue create with no --body is out of scope"""
        self.assertEqual(self.run_hook('gh issue create --title "test"'), "")

    def test_english_body_structure_only(self) -> None:
        """T-014 An English body returns the structure review alone"""
        body = (
            "This is an English issue body with enough content to verify that textlint does "
            + "not run on non-Japanese text. The structure review should still appear."
        )
        out = self.run_hook(f'gh issue create --title "test" --body "{body}"')
        self.assert_all_in(out, CHECKLIST, "additionalContext")

    def test_commit_mentioning_a_filing_is_still_a_commit(self) -> None:
        """T-029 A commit message holding the words of a filing command is proofread too"""
        # Calling it a filing on the words alone changes where the body is fetched from, and the
        # proofreading quietly skips.
        cmd = 'git commit -m "fix: gh issue create の説明。これは、テスト、です、が、読点、が、多すぎ、ます。"'
        out = self.run_hook(cmd)
        self.assert_all_in(out, FINDINGS, "commit message")

    def test_commit_heredoc_mentioning_a_filing_is_still_a_commit(self) -> None:
        """T-030 A commit whose heredoc body holds the words of a filing command is proofread too"""
        body = "fix: これは、テスト、です、が、読点、が、多すぎ、ます。\n\ngh issue create --title x の行"
        out = self.run_hook(self.heredoc_commit(body, delimiter="'EOF'"))
        with self.subTest("proofreads the heredoc message"):
            self.assertIn(FINDINGS, out)
        with self.subTest("no structure checklist for commit"):
            self.assertNotIn(CHECKLIST, out)


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
