"""Integration tests for hooks/security/git_sandbox_guard.py (PreToolUse hook).

The guard reads the config directory from CLAUDE_CONFIG_DIR, so a fixture repository
stands in for it and the suite passes wherever the checkout lives.

Run: python3 hooks/security/tests/git_sandbox_guard_test.py
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "git_sandbox_guard.py"

# The value alone, so the assertion survives jq switching between -c and pretty output.
DENY_MARK = '"deny"'


class TestGitSandboxGuard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory(prefix="git-sandbox-guard-tests-")
        cls.guarded = cls.fixture_repo(Path(cls.tmpdir.name) / "config")
        # A second repository, to show the guard keys on which repository it is rather than on
        # whether the path is a repository at all.
        cls.unguarded = cls.fixture_repo(Path(cls.tmpdir.name) / "other")

    @classmethod
    def tearDownClass(cls):
        cls.tmpdir.cleanup()

    @staticmethod
    def fixture_repo(path):
        path.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(path)], check=True, capture_output=True)
        # resolve() because rev-parse reports a physical path and macOS hands out a
        # symlinked TMPDIR.
        return path.resolve()

    def run_hook(self, command, cwd=None, escaped=False):
        payload = json.dumps(
            {
                "tool_name": "Bash",
                "cwd": str(cwd if cwd else self.guarded),
                "tool_input": {"command": command, "dangerouslyDisableSandbox": escaped},
            }
        )
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
            env=dict(os.environ, CLAUDE_CONFIG_DIR=str(self.guarded)),
        )
        return result.stdout

    def assert_denied(self, command, **kwargs):
        with self.subTest(command=command):
            self.assertIn(DENY_MARK, self.run_hook(command, **kwargs), "deny を返さない")

    def assert_allowed(self, command, **kwargs):
        with self.subTest(command=command):
            self.assertNotIn(DENY_MARK, self.run_hook(command, **kwargs), "deny を返す")

    def test_tree_rewriting_is_denied(self):
        """T-001 作業ツリーを書き換える git は止める"""
        for command in (
            "git checkout main",
            "git checkout -- agents/x.md",
            "git switch main",
            "git pull",
            "git pull --ff-only origin main",
            "git merge origin/main",
            "git rebase main",
            "git reset --hard origin/main",
            "git revert HEAD",
            "git cherry-pick abc1234",
            "git stash pop",
            "git restore agents/x.md",
            "git clean -fd",
        ):
            self.assert_denied(command)

    def test_file_moving_subcommands_are_denied(self):
        """T-008 追跡ファイルを消す / 動かす git も止める"""
        # index だけ進んで作業ツリーが取り残される形は checkout と同じ。
        for command in (
            "git rm agents/x.md",
            "git mv agents/x.md agents/y.md",
            "git sparse-checkout set docs",
            "git sparse-checkout disable",
        ):
            self.assert_denied(command)

    def test_index_only_variants_of_those_pass(self):
        """T-009 同じ subcommand でも作業ツリーを触らない形は通す"""
        for command in (
            "git rm --cached agents/x.md",
            "git rm -n agents/x.md",
            "git sparse-checkout list",
        ):
            self.assert_allowed(command)

    def test_index_only_and_branch_create_pass(self):
        """T-002 ファイルを書かない git は通す"""
        for command in (
            "git checkout -b docs/foo",
            "git switch -c docs/foo",
            "git reset --mixed origin/main",
            "git reset --soft HEAD~1",
            "git stash list",
            "git fetch origin",
            "git status --short",
            "git diff --stat",
            "git push -u origin HEAD",
        ):
            self.assert_allowed(command)

    def test_escaped_call_passes(self):
        """T-003 sandbox を外した呼び出しは通す"""
        self.assert_allowed("git pull", escaped=True)

    def test_other_repository_passes(self):
        """T-004 別のリポジトリは対象外"""
        self.assert_allowed("git pull", cwd=self.unguarded)

    def test_quoted_text_is_not_a_call(self):
        """T-005 引用符の中の git はコマンドではない"""
        self.assert_allowed('git commit -m "git pull を追加"')
        self.assert_allowed('echo "run git checkout main"')

    def test_unparsable_is_denied(self):
        """T-006 閉じられない行は fail-closed"""
        self.assert_denied('git commit -m "unclosed')

    def test_non_git_passes(self):
        """T-007 git 以外は素通り"""
        self.assert_allowed("ls -la")
        self.assert_allowed("gh pr list")

    def test_help_is_not_a_rewrite(self):
        """T-010 --help は木を書き換えないので通す"""
        for command in (
            "git checkout --help",
            "git stash --help",
            "git rm --help",
            "git apply --help",
        ):
            self.assert_allowed(command)

    def test_clean_dry_run_is_allowed(self):
        """T-011 対象を一覧するだけの git clean は通す"""
        # rm-to-trash と同じ判定。一覧だけなら木は変わらない。
        self.assert_allowed("git clean -n")
        self.assert_allowed("git clean --dry-run")
        self.assert_allowed("git clean -nd")
        self.assert_denied("git clean -fd")

    def test_apply_inspection_is_allowed(self):
        """T-012 patch を検査するだけの git apply は通す"""
        self.assert_allowed("git apply --check x.patch")
        self.assert_allowed("git apply --stat x.patch")
        self.assert_denied("git apply x.patch")

    def test_mv_dry_run_is_allowed(self):
        """T-013 移動先を表示するだけの git mv は通す"""
        # git rm と同じ綴りを同じ意味で受ける。
        self.assert_allowed("git mv -n agents/a.md agents/b.md")
        self.assert_allowed("git mv --dry-run agents/a.md agents/b.md")
        self.assert_denied("git mv agents/a.md agents/b.md")

    def test_restore_staged_is_allowed(self):
        """T-014 index だけを戻す git restore は通す"""
        self.assert_allowed("git restore --staged agents/x.md")
        # --worktree を併せると木へ届くので、--staged があっても止める。
        self.assert_denied("git restore --staged --worktree agents/x.md")
        self.assert_denied("git restore agents/x.md")

    def test_rebase_inspection_is_allowed(self):
        """T-015 patch を表示するだけの git rebase は通す"""
        self.assert_allowed("git rebase --show-current-patch")
        self.assert_denied("git rebase --abort")

    def test_path_after_the_separator_is_not_a_flag(self):
        """T-016 -- の後はパスなのでフラグとして読まない"""
        # -h という名前のファイルはヘルプ表示のフラグと綴りが同じで、フラグとして読むと素通りする。
        self.assert_denied("git rm -- -h")
        self.assert_denied("git checkout -- --help")

    def test_bisect_moves_head(self):
        """T-017 HEAD を動かす git bisect は止める"""
        # start と good/bad は checkout を伴うので、この hook が防ぐ食い違いをそのまま起こす。
        for command in (
            "git bisect start",
            "git bisect good",
            "git bisect bad HEAD~3",
            "git bisect reset",
        ):
            self.assert_denied(command)

    def test_bisect_inspection_is_allowed(self):
        """T-018 記録を見るだけの git bisect は通す"""
        for command in (
            "git bisect log",
            "git bisect view",
            "git bisect visualize",
            "git bisect terms",
        ):
            self.assert_allowed(command)

    def test_plumbing_that_writes_the_tree(self):
        """T-019 index から作業ツリーへ書く plumbing は止める"""
        # porcelain でないので名前で見分けが付かないが、木の中身は checkout と同じだけ動く。
        self.assert_denied("git checkout-index -a -f")
        self.assert_denied("git read-tree -u --reset HEAD~1")

    def test_plumbing_that_stops_at_the_index(self):
        """T-020 index で止まる plumbing は通す"""
        self.assert_allowed("git read-tree HEAD~1")
        self.assert_allowed("git write-tree")
        self.assert_allowed("git update-index --refresh")

    def test_filter_branch_rewrites_the_tree(self):
        """T-021 履歴を書き換える git filter-branch は止める"""
        # --tree-filter が各コミットを checkout して回るので、作業ツリーが総取り替えになる。
        self.assert_denied("git filter-branch --force --tree-filter true HEAD")


if __name__ == "__main__":
    unittest.main(verbosity=2)
