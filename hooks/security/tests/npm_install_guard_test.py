"""Integration tests for hooks/security/npm_install_guard.py (PreToolUse hook).

$HOME decides the verdict, so each case runs against a home whose .npmrc it controls
rather than the one this machine happens to have.

Run: python3 hooks/security/tests/npm_install_guard_test.py
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from typing import ClassVar, override

HOOK = Path(__file__).resolve().parents[1] / "npm_install_guard.py"

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_lib"))

import hook_harness  # noqa: E402

# The value alone, so the assertion survives jq switching between -c and pretty output.
# Asserting on the value rather than on any output at all: PreToolUse reads only
# allow / deny / ask / defer, and a decision written with anything else fails schema
# validation and lets the install run.
DENY_MARK = '"deny"'


class TestNpmInstallGuard(unittest.TestCase):
    # Declared here rather than assigned into setUpClass alone: a type checker reads an
    # attribute that first appears inside a method as unknown on the class.
    tmpdir: ClassVar[tempfile.TemporaryDirectory[str]]
    home_unset: ClassVar[Path]
    home_configured: ClassVar[Path]
    root: ClassVar[Path]

    @classmethod
    @override
    def setUpClass(cls) -> None:
        cls.tmpdir = tempfile.TemporaryDirectory(prefix="npm-install-guard-tests-")
        root = Path(cls.tmpdir.name)
        cls.home_unset = root / "unset"
        cls.home_configured = root / "configured"
        cls.home_unset.mkdir()
        cls.home_configured.mkdir()
        _ = (cls.home_configured / ".npmrc").write_text("ignore-scripts=true\n", encoding="utf-8")
        cls.root = root

    @classmethod
    @override
    def tearDownClass(cls) -> None:
        cls.tmpdir.cleanup()

    def run_hook(self, home: Path, command: str) -> str:
        payload = {"tool_name": "Bash", "tool_input": {"command": command}}
        return hook_harness.run(HOOK, payload, dict(os.environ, HOME=str(home)))

    def assert_denied(self, home: Path, command: str) -> None:
        with self.subTest(command=command):
            self.assertIn(DENY_MARK, self.run_hook(home, command), "does not deny")

    def assert_allowed(self, home: Path, command: str) -> None:
        with self.subTest(command=command):
            self.assertNotIn(DENY_MARK, self.run_hook(home, command), "denies")

    def assert_empty(self, home: Path, command: str) -> None:
        with self.subTest(command=command):
            self.assertEqual(self.run_hook(home, command), "", "returns something")

    def test_install_without_the_setting_is_denied(self) -> None:
        """T-001 An install without ignore-scripts=true is denied"""
        self.assert_denied(self.home_unset, "npm install")
        self.assert_denied(self.home_unset, "pnpm add zod")
        self.assert_denied(self.home_unset, "yarn upgrade")
        self.assert_denied(self.home_unset, "ni")

    def test_install_after_another_command_is_denied(self) -> None:
        """T-002 An install behind another command is denied too"""
        # Reading the first token alone finds cd, and the install never reaches the scan.
        self.assert_denied(self.home_unset, "cd /tmp && npm install")
        self.assert_denied(self.home_unset, "cd /tmp\nnpm install")

    def test_extra_spacing_is_denied(self) -> None:
        """T-003 Two spaces between the words are denied too"""
        self.assert_denied(self.home_unset, "npm  install")

    def test_option_before_the_subcommand_is_denied(self) -> None:
        """T-009 Options before the subcommand are skipped before deciding"""
        # A valued flag swallows the next token, so skipping it wrong makes /tmp the subcommand.
        self.assert_denied(self.home_unset, "npm --prefix /tmp install")
        self.assert_denied(self.home_unset, "npm --silent install")

    def test_fetch_and_run_is_denied(self) -> None:
        """T-004 Fetching a package and running it is denied too"""
        # npx installs before it runs, so the install scripts run just the same.
        self.assert_denied(self.home_unset, "npx create-vite my-app")
        self.assert_denied(self.home_unset, "nlx create-vite my-app")
        self.assert_denied(self.home_unset, "bunx create-vite my-app")

    def test_configured_home_passes(self) -> None:
        """T-005 ignore-scripts=true in ~/.npmrc lets it pass"""
        self.assert_allowed(self.home_configured, "npm install")
        self.assert_allowed(self.home_configured, "npx create-vite my-app")

    def test_command_side_override_is_denied(self) -> None:
        """T-006 A flag overriding ~/.npmrc is denied even when configured"""
        # The setting loses to the flag on the command, so reading the setting alone lets it through.
        self.assert_denied(self.home_configured, "npm install --ignore-scripts=false")
        self.assert_denied(self.home_configured, "npm install --no-ignore-scripts")

    def test_non_install_commands_are_skipped(self) -> None:
        """T-007 A command that installs nothing returns nothing"""
        self.assert_empty(self.home_unset, "npm run build")
        self.assert_empty(self.home_unset, "git status")
        self.assert_empty(self.home_unset, "npm ls --depth=0")

    def test_quoted_text_is_not_an_install(self) -> None:
        """T-008 A word inside quotes does not count as an install"""
        self.assert_allowed(self.home_unset, "git commit -m 'run npm install first'")

    def test_env_assignment_does_not_hide_an_install(self) -> None:
        """T-010 A leading environment assignment does not hide an install"""
        # Reading the assignment as the command name misses npm, and the install scripts run.
        self.assert_denied(self.home_unset, "FOO=1 npm install zod")

    def test_fetch_and_run_spellings_are_denied(self) -> None:
        """T-011 Other spellings of fetch-and-run are denied too"""
        # As with npx, the dependencies install before the bin runs.
        self.assert_denied(self.home_unset, "pnpm dlx cowsay")
        self.assert_denied(self.home_unset, "npm exec cowsay")
        self.assert_denied(self.home_unset, "bun x cowsay")
        self.assert_denied(self.home_unset, "yarn dlx cowsay")

    def test_npmrc_spacing_is_read(self) -> None:
        """T-012 A spelling npm reads as true counts as configured"""
        # npm config get reads `ignore-scripts = true` as true.
        home = Path(tempfile.mkdtemp(dir=self.root, prefix="spaced"))
        _ = (home / ".npmrc").write_text("ignore-scripts = true\n", encoding="utf-8")
        self.assert_allowed(home, "npm install zod")

    def test_project_npmrc_overrides_home(self) -> None:
        """T-013 A project .npmrc that overrides it is denied"""
        # npm reads the project .npmrc last, so the true in the home one alone lets it through.
        project = Path(tempfile.mkdtemp(dir=self.root, prefix="proj"))
        _ = (project / ".npmrc").write_text("ignore-scripts=false\n", encoding="utf-8")
        self.assert_denied(self.home_configured, f"cd {project} && npm install zod")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
