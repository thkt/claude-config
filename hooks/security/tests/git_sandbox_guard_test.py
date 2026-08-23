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
import time
import unittest
from pathlib import Path
from typing import ClassVar, override

HOOK = Path(__file__).resolve().parents[1] / "git_sandbox_guard.py"

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_lib"))

import hook_harness  # noqa: E402

# The value alone, so the assertion survives jq switching between -c and pretty output.
DENY_MARK = '"deny"'


def run_hook(
    command: str,
    cwd: Path,
    config: Path,
    escaped: bool = False,
    path: str | None = None,
) -> str:
    """The hook's stdout, after confirming it ran.

    A hook that dies before writing anything returns an empty string, which every
    "is not a deny" assertion accepts.
    """
    payload = json.dumps(
        {
            "tool_name": "Bash",
            "cwd": str(cwd),
            "tool_input": {"command": command, "dangerouslyDisableSandbox": escaped},
        }
    )
    env = dict(os.environ, CLAUDE_CONFIG_DIR=str(config), PATH=path or os.environ["PATH"])
    return hook_harness.run(HOOK, payload, env)


class TestGitSandboxGuard(unittest.TestCase):
    # ClassVar rather than a bare annotation: setUpClass fills these, and a bare annotation
    # reads as an instance variable that no __init__ ever assigns.
    tmpdir: ClassVar[tempfile.TemporaryDirectory[str]]
    guarded: ClassVar[Path]
    unguarded: ClassVar[Path]

    @classmethod
    @override
    def setUpClass(cls) -> None:
        cls.tmpdir = tempfile.TemporaryDirectory(prefix="git-sandbox-guard-tests-")
        cls.guarded = cls.fixture_repo(Path(cls.tmpdir.name) / "config")
        # A second repository, to show the guard keys on which repository it is rather than on
        # whether the path is a repository at all.
        cls.unguarded = cls.fixture_repo(Path(cls.tmpdir.name) / "other")

    @classmethod
    @override
    def tearDownClass(cls) -> None:
        cls.tmpdir.cleanup()

    @staticmethod
    def fixture_repo(path: Path) -> Path:
        path.mkdir(parents=True)
        _ = subprocess.run(["git", "init", "-q", str(path)], check=True, capture_output=True)
        # resolve() because rev-parse reports a physical path and macOS hands out a
        # symlinked TMPDIR.
        return path.resolve()

    def run_hook(self, command: str, cwd: Path | None = None, escaped: bool = False) -> str:
        return run_hook(command, cwd if cwd else self.guarded, self.guarded, escaped)

    # cwd and escaped spelled out rather than **kwargs: a checker cannot see through **kwargs
    # to the signature of run_hook, and every call site reads as untyped.
    def assert_denied(self, command: str, cwd: Path | None = None, escaped: bool = False) -> None:
        with self.subTest(command=command):
            self.assertIn(DENY_MARK, self.run_hook(command, cwd, escaped), "does not deny")

    def assert_allowed(self, command: str, cwd: Path | None = None, escaped: bool = False) -> None:
        with self.subTest(command=command):
            self.assertNotIn(DENY_MARK, self.run_hook(command, cwd, escaped), "denies")

    def test_tree_rewriting_is_denied(self) -> None:
        """T-001 A git that rewrites the working tree is denied"""
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

    def test_file_moving_subcommands_are_denied(self) -> None:
        """T-008 A git that removes or moves a tracked file is denied too"""
        # The index moving on while the working tree stays behind is the checkout shape.
        for command in (
            "git rm agents/x.md",
            "git mv agents/x.md agents/y.md",
            "git sparse-checkout set docs",
            "git sparse-checkout disable",
        ):
            self.assert_denied(command)

    def test_index_only_variants_of_those_pass(self) -> None:
        """T-009 The same subcommand passes in a form that leaves the tree alone"""
        for command in (
            "git rm --cached agents/x.md",
            "git rm -n agents/x.md",
            "git sparse-checkout list",
        ):
            self.assert_allowed(command)

    def test_index_only_and_branch_create_pass(self) -> None:
        """T-002 A git that writes no file passes"""
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

    def test_escaped_call_passes(self) -> None:
        """T-003 A call with the sandbox lifted passes"""
        self.assert_allowed("git pull", escaped=True)

    def test_other_repository_passes(self) -> None:
        """T-004 Another repository is out of scope"""
        self.assert_allowed("git pull", cwd=self.unguarded)

    def test_quoted_text_is_not_a_call(self) -> None:
        """T-005 A git inside quotes is not a command"""
        self.assert_allowed('git commit -m "git pull を追加"')
        self.assert_allowed('echo "run git checkout main"')

    def test_unparsable_is_denied(self) -> None:
        """T-006 A line that cannot be closed is fail-closed"""
        self.assert_denied('git commit -m "unclosed')

    def test_non_git_passes(self) -> None:
        """T-007 Anything but git passes straight through"""
        self.assert_allowed("ls -la")
        self.assert_allowed("gh pr list")

    def test_help_is_not_a_rewrite(self) -> None:
        """T-010 --help rewrites no tree, so it passes"""
        for command in (
            "git checkout --help",
            "git stash --help",
            "git rm --help",
            "git apply --help",
        ):
            self.assert_allowed(command)

    def test_clean_dry_run_is_allowed(self) -> None:
        """T-011 A git clean that only lists its targets passes"""
        # The same call rm-to-trash makes: a listing alone leaves the tree unchanged.
        self.assert_allowed("git clean -n")
        self.assert_allowed("git clean --dry-run")
        self.assert_allowed("git clean -nd")
        self.assert_denied("git clean -fd")

    def test_apply_inspection_is_allowed(self) -> None:
        """T-012 A git apply that only inspects the patch passes"""
        self.assert_allowed("git apply --check x.patch")
        self.assert_allowed("git apply --stat x.patch")
        self.assert_denied("git apply x.patch")

    def test_mv_dry_run_is_allowed(self) -> None:
        """T-013 A git mv that only prints the destination passes"""
        # Takes the same spelling as git rm, with the same meaning.
        self.assert_allowed("git mv -n agents/a.md agents/b.md")
        self.assert_allowed("git mv --dry-run agents/a.md agents/b.md")
        self.assert_denied("git mv agents/a.md agents/b.md")

    def test_restore_staged_is_allowed(self) -> None:
        """T-014 A git restore that only rewinds the index passes"""
        self.assert_allowed("git restore --staged agents/x.md")
        # Paired with --worktree it reaches the tree, so --staged does not save it.
        self.assert_denied("git restore --staged --worktree agents/x.md")
        self.assert_denied("git restore agents/x.md")

    def test_rebase_inspection_is_allowed(self) -> None:
        """T-015 A git rebase that only prints the patch passes"""
        self.assert_allowed("git rebase --show-current-patch")
        self.assert_denied("git rebase --abort")

    def test_path_after_the_separator_is_not_a_flag(self) -> None:
        """T-016 What follows -- is a path, not a flag"""
        # A file named -h is spelled like the help flag, and reading it as one lets it through.
        self.assert_denied("git rm -- -h")
        self.assert_denied("git checkout -- --help")

    def test_bisect_moves_head(self) -> None:
        """T-017 A git bisect that moves HEAD is denied"""
        # start and good/bad carry a checkout, causing the very mismatch this hook prevents.
        for command in (
            "git bisect start",
            "git bisect good",
            "git bisect bad HEAD~3",
            "git bisect reset",
        ):
            self.assert_denied(command)

    def test_bisect_inspection_is_allowed(self) -> None:
        """T-018 A git bisect that only reads the record passes"""
        for command in (
            "git bisect log",
            "git bisect view",
            "git bisect visualize",
            "git bisect terms",
        ):
            self.assert_allowed(command)

    def test_plumbing_that_writes_the_tree(self) -> None:
        """T-019 Plumbing writing from the index into the tree is denied"""
        # Not porcelain, so the name gives nothing away, but the tree moves as much as under checkout.
        self.assert_denied("git checkout-index -a -f")
        self.assert_denied("git read-tree -u --reset HEAD~1")

    def test_plumbing_that_stops_at_the_index(self) -> None:
        """T-020 Plumbing that stops at the index passes"""
        self.assert_allowed("git read-tree HEAD~1")
        self.assert_allowed("git write-tree")
        self.assert_allowed("git update-index --refresh")

    def test_filter_branch_rewrites_the_tree(self) -> None:
        """T-021 A git filter-branch that rewrites history is denied"""
        # --tree-filter checks out every commit in turn, replacing the working tree wholesale.
        self.assert_denied("git filter-branch --force --tree-filter true HEAD")


class TestTargetRepository(unittest.TestCase):
    """cwd is not where the call lands. `-C`, `--git-dir`, and `--work-tree` each carry it
    into another repository, so these run from a cwd that is not the protected one."""

    tmpdir: ClassVar[tempfile.TemporaryDirectory[str]]
    guarded: ClassVar[Path]
    outside: ClassVar[Path]

    @classmethod
    @override
    def setUpClass(cls) -> None:
        cls.tmpdir = tempfile.TemporaryDirectory(prefix="git-sandbox-guard-target-")
        cls.guarded = TestGitSandboxGuard.fixture_repo(Path(cls.tmpdir.name) / "config")
        # Deliberately not a repository: the redirect flags, not cwd, have to carry the call in.
        cls.outside = Path(cls.tmpdir.name) / "elsewhere"
        cls.outside.mkdir()

    @classmethod
    @override
    def tearDownClass(cls) -> None:
        cls.tmpdir.cleanup()

    def test_redirect_flags_reach_the_guarded_tree(self) -> None:
        """T-022 A call redirected into the protected repository is denied from any cwd"""
        for command in (
            f"git -C {self.guarded} checkout main",
            f"git --git-dir={self.guarded}/.git --work-tree={self.guarded} checkout main",
        ):
            with self.subTest(command=command):
                self.assertIn(
                    DENY_MARK, run_hook(command, self.outside, self.guarded), "does not deny"
                )

    def test_a_cwd_outside_any_repository_passes(self) -> None:
        """T-023 Without a redirect the call reaches no repository, so it passes"""
        self.assertNotIn(
            DENY_MARK, run_hook("git checkout main", self.outside, self.guarded), "denies"
        )

    def test_an_unresolvable_config_directory_is_fail_closed(self) -> None:
        """T-024 An unresolvable CLAUDE_CONFIG_DIR denies rather than clearing the call"""
        dangling = Path(self.tmpdir.name) / "not-there"
        command = f"git -C {self.guarded} checkout main"
        self.assertIn(DENY_MARK, run_hook(command, self.outside, dangling), "does not deny")

    def test_every_call_on_the_line_is_probed(self) -> None:
        """T-026 A redirected call is denied even when an earlier git call is not"""
        command = f"git checkout main && git -C {self.guarded} checkout main"
        self.assertIn(DENY_MARK, run_hook(command, self.outside, self.guarded), "does not deny")

    def test_an_environment_prefix_reaches_the_guarded_tree(self) -> None:
        """T-027 GIT_DIR / GIT_WORK_TREE pick the repository the same way the flags do"""
        command = f"GIT_DIR={self.guarded}/.git GIT_WORK_TREE={self.guarded} git checkout main"
        self.assertIn(DENY_MARK, run_hook(command, self.outside, self.guarded), "does not deny")

    def test_an_environment_prefix_on_a_read_passes(self) -> None:
        """T-028 The prefix alone is not a rewrite, so a read still passes"""
        command = f"GIT_DIR={self.guarded}/.git GIT_WORK_TREE={self.guarded} git status"
        self.assertNotIn(DENY_MARK, run_hook(command, self.outside, self.guarded), "denies")

    def test_a_probe_that_cannot_answer_is_fail_closed(self) -> None:
        """T-029 A rev-parse failure that is not "no repository" denies rather than passing"""
        missing = Path(self.tmpdir.name) / "gone"
        command = f"git -C {missing} checkout main"
        self.assertIn(DENY_MARK, run_hook(command, self.outside, self.guarded), "does not deny")

    def test_a_probe_that_never_answers_is_fail_closed(self) -> None:
        """T-030 A rev-parse that stalls past the bound denies rather than blocking forever"""
        shim = Path(self.tmpdir.name) / "shim"
        shim.mkdir(exist_ok=True)
        stall = shim / "git"
        _ = stall.write_text("#!/bin/sh\nsleep 60\n")
        stall.chmod(0o755)
        started = time.monotonic()
        # PATH, not a patched constant: the bound has to hold around the real subprocess call.
        out = run_hook(
            f"git -C {self.guarded} checkout main",
            self.outside,
            self.guarded,
            path=f"{shim}:{os.environ['PATH']}",
        )
        self.assertIn(DENY_MARK, out, "does not deny")
        self.assertLess(time.monotonic() - started, 30, "did not bound the probe")

    def test_the_fail_closed_deny_stops_at_repositories(self) -> None:
        """T-025 An unresolvable config directory leaves a cwd outside any repository alone"""
        dangling = Path(self.tmpdir.name) / "not-there"
        self.assertNotIn(DENY_MARK, run_hook("git checkout main", self.outside, dangling), "denies")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
