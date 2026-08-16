"""Integration tests for hooks/pre-bash/proofread_body.py (PreToolUse hook).

Run: python3 hooks/pre-bash/tests/proofread_body_test.py
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "proofread_body.py"

# ≥50 Japanese chars (has_japanese threshold) with a deterministic finding (redundant expression)
LINTED_BODY = (
    "この機能はユーザーが設定を変更することができます。"
    "この説明は日本語判定の五十文字閾値を超えるための追加の文章です。"
)

FINDINGS = "textlint 校正結果"
CHECKLIST = "構造レビュー"


class TestProofreadBody(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory(prefix="proofread-body-tests-")
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)

    def run_hook(self, command, tool="Bash", tool_input=None, env=None):
        payload = json.dumps(
            {"tool_name": tool, "tool_input": tool_input or {"command": command}}
        )
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )
        return result.stdout

    def with_body_file(self, name="plain"):
        directory = self.root / name
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "body.md"
        path.write_text(LINTED_BODY + "\n", encoding="utf-8")
        return path

    def assert_all_in(self, output, *phrases):
        for phrase in phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, output)

    def test_issue_create_advisory(self):
        """T-006 指摘の出る本文の gh issue create は textlint の指摘を返す"""
        out = self.run_hook(f'gh issue create --title "test" --body "{LINTED_BODY}"')
        self.assert_all_in(out, "hookSpecificOutput", "PreToolUse", FINDINGS, CHECKLIST)
        with self.subTest("no top-level decision"):
            self.assertNotIn('"decision"', out)
        # A real newline encodes as \n in JSON, an unexpanded one as \\n.
        with self.subTest("newlines are expanded"):
            self.assertNotIn("\\\\n", out)

    def test_issue_create_body_file(self):
        """T-020 gh issue create の --body-file が指す本文が校正される"""
        path = self.with_body_file("issue")
        out = self.run_hook(f'gh issue create --title "test" --body-file {path}')
        self.assert_all_in(out, FINDINGS, CHECKLIST)

    def test_pr_create_body_file(self):
        """T-021 gh pr create の --body-file が指す本文が校正される"""
        path = self.with_body_file("pr")
        self.assertIn(FINDINGS, self.run_hook(f'gh pr create --title "test" --body-file {path}'))

    def test_quoted_body_file(self):
        """T-023 引用符で囲まれた --body-file のパスも読む"""
        path = self.with_body_file("with space")
        out = self.run_hook(f'gh issue create --title "test" --body-file "{path}"')
        self.assertIn(FINDINGS, out)

    def test_relative_body_file_without_cd_skipped(self):
        """T-022 cd の無い相対パスの --body-file は校正しない"""
        # 解く手掛かりがコマンド上に無い。hook はコマンドが走る cwd を持たない。
        out = self.run_hook('gh issue create --title "test" --body-file body.md')
        self.assertEqual(out, "")

    def test_relative_body_file_after_cd_is_read(self):
        """T-028 cd のある相対パスの --body-file は校正する"""
        # cd が解く先を書いているので、絶対パスで書いたときと同じく校正が届く。
        # 読めないままだと、骨格照合だけ通って校正が静かに抜ける。
        directory = self.root / "rel"
        directory.mkdir()
        (directory / "body.md").write_text(
            "## What & Why\n\nこれは、テストの本文です。適切に処理する。\n", encoding="utf-8"
        )
        out = self.run_hook(f'cd {directory} && gh issue create --title "test" --body-file body.md')
        self.assertIn(CHECKLIST, out)

    def test_issue_create_clean(self):
        """T-007 指摘の出ない本文の gh issue create は構造レビューだけを返す"""
        out = self.run_hook('gh issue create --title "test" --body "テストです。"')
        self.assert_all_in(out, CHECKLIST, "additionalContext")
        with self.subTest("no textlint findings"):
            self.assertNotIn(FINDINGS, out)

    def test_tmpdir_trailing_slash(self):
        """T-019 TMPDIR が末尾スラッシュ付きでも一時ファイルのパスが指摘に残らない"""
        # macOS が渡す TMPDIR は末尾スラッシュ付き。走らせる環境の TMPDIR が既にその形の場合が
        # あるので 2 つ足し、剥ぎ取りが 1 つで止まらないことまで見る。
        env = dict(os.environ, TMPDIR=os.environ.get("TMPDIR", "/tmp") + "//")
        out = self.run_hook(f'gh issue create --title "test" --body "{LINTED_BODY}"', env=env)
        with self.subTest("has textlint findings"):
            self.assertIn(FINDINGS, out)
        with self.subTest("no temp file path"):
            self.assertNotIn("body.md", out)

    def test_non_gh_command_skipped(self):
        """T-008 git status は対象外"""
        self.assertEqual(self.run_hook("git status"), "")

    def test_pr_create_advisory(self):
        """T-010 指摘の出る本文の gh pr create は advisory を返す"""
        out = self.run_hook(f'gh pr create --title "test" --body "{LINTED_BODY}"')
        self.assert_all_in(out, "additionalContext", FINDINGS)

    def test_pr_create_multiline_body(self):
        """T-015 複数行の本文でも gh pr create は校正される"""
        body = (
            "一行目は複数行の本文が正しく抽出されることを確認する文です。\n"
            "これは、二行目、で、読点、が、多す、ぎます。\n"
            "三行目は日本語判定の五十文字閾値を確実に超えるための追加の文章です。"
        )
        out = self.run_hook(f'gh pr create --title "test" --body "{body}"')
        self.assert_all_in(out, FINDINGS, "max-ten")

    def test_commit_heredoc_advisory(self):
        """T-016 heredoc の commit message は構造レビュー無しで advisory を返す"""
        cmd = (
            'git commit -m "$(cat <<\'EOF\'\n'
            "fix(hooks): 処理を行うことが出来ます\n\n"
            "これは、テスト、です、が、読点、が、多すぎ、ます。\nEOF\n)\""
        )
        out = self.run_hook(cmd)
        self.assert_all_in(out, FINDINGS, "commit message")
        with self.subTest("no structure checklist for commit"):
            self.assertNotIn(CHECKLIST, out)

    def test_commit_bare_heredoc_advisory(self):
        """T-024 引用符なしのデリミタで書いた commit message も校正される"""
        # 引用符付きの <<'EOF' だけを見ると、<<EOF は本文なしと判定されて校正が黙って抜ける。
        cmd = (
            'git commit -m "$(cat <<EOF\n'
            "fix(hooks): 処理を行うことが出来ます\n\n"
            "これは、テスト、です、が、読点、が、多すぎ、ます。\nEOF\n)\""
        )
        out = self.run_hook(cmd)
        self.assert_all_in(out, FINDINGS, "commit message")

    def test_commit_message_file_advisory(self):
        """T-025 git commit -F が指す本文も校正される"""
        path = self.with_body_file("commit")
        out = self.run_hook(f"git commit -F {path}")
        with self.subTest("has textlint findings"):
            self.assertIn(FINDINGS, out)
        with self.subTest("no structure checklist for commit"):
            self.assertNotIn(CHECKLIST, out)

    def test_short_flags_advisory(self):
        """T-026 gh create の短縮フラグ (-b / -F) で渡した本文も校正される"""
        path = self.with_body_file("short")
        with self.subTest("-F is read"):
            self.assertIn(FINDINGS, self.run_hook(f'gh issue create --title "test" -F {path}'))
        with self.subTest("-b is read"):
            self.assertIn(
                FINDINGS, self.run_hook(f'gh issue create --title "test" -b "{LINTED_BODY}"')
            )

    def test_unrelated_heredoc_is_not_the_body(self):
        """T-027 起票の前に別ファイルを書き出す heredoc は本文として読まない"""
        # heredoc を無条件に優先すると、校正されるのは issue 本文でなくそのファイルになる。
        # 出力には指摘が出るので、本文を校正した場合と見分けが付かなくなる。
        path = self.with_body_file("heredoc")
        cmd = (
            "cat > /tmp/patch.py <<'PY'\n"
            "これは、無関係、な、ファイル、の、中身、です。\nPY\n"
            f'gh issue create --title "test" --body-file {path}'
        )
        out = self.run_hook(cmd)
        # 指摘は出典の文言を引用しないので、どちらを校正したかはルール名で見分ける。本文は冗長表現
        # (dict2)、heredoc の中身は読点の数 (max-ten) に当たる。
        with self.subTest("lints the body file"):
            self.assertIn("dict2", out)
        with self.subTest("not the heredoc content"):
            self.assertNotIn("max-ten", out)

    def test_commit_inline_advisory(self):
        """T-017 git commit -m の本文に指摘があれば advisory を返す"""
        out = self.run_hook('git commit -m "fix: これは、読点、が、多い、修正、です。"')
        self.assertIn(FINDINGS, out)

    def test_commit_clean_silent(self):
        """T-018 指摘の出ない commit message では何も返さない"""
        out = self.run_hook('git commit -m "fix(hooks): commit message の textlint 対応を追加する"')
        self.assertEqual(out, "")

    def test_non_bash_tool_skipped(self):
        """T-012 Write は対象外"""
        out = self.run_hook(None, tool="Write", tool_input={"file_path": "/some/file.md"})
        self.assertEqual(out, "")

    def test_no_body_skipped(self):
        """T-013 --body の無い gh issue create は対象外"""
        self.assertEqual(self.run_hook('gh issue create --title "test"'), "")

    def test_english_body_structure_only(self):
        """T-014 英語の本文には構造レビューだけを返す"""
        body = (
            "This is an English issue body with enough content to verify that textlint does "
            "not run on non-Japanese text. The structure review should still appear."
        )
        out = self.run_hook(f'gh issue create --title "test" --body "{body}"')
        self.assert_all_in(out, CHECKLIST, "additionalContext")

    def test_commit_mentioning_a_filing_is_still_a_commit(self):
        """T-029 起票コマンドの語を含むコミットメッセージも校正する"""
        # 語の出現だけで起票と判定すると、本文を取りに行く先が変わり、校正が静かに飛ぶ。
        cmd = 'git commit -m "fix: gh issue create の説明。これは、テスト、です、が、読点、が、多すぎ、ます。"'
        out = self.run_hook(cmd)
        self.assert_all_in(out, FINDINGS, "commit message")

    def test_commit_heredoc_mentioning_a_filing_is_still_a_commit(self):
        """T-030 heredoc 本文に起票コマンドの語があるコミットも校正する"""
        cmd = (
            'git commit -m "$(cat <<\'EOF\'\n'
            "fix: これは、テスト、です、が、読点、が、多すぎ、ます。\n\n"
            "gh issue create --title x の行\nEOF\n)\""
        )
        out = self.run_hook(cmd)
        with self.subTest("proofreads the heredoc message"):
            self.assertIn(FINDINGS, out)
        with self.subTest("no structure checklist for commit"):
            self.assertNotIn(CHECKLIST, out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
