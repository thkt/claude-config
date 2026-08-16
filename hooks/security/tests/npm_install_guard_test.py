"""Integration tests for hooks/security/npm_safe_install.py (PreToolUse hook).

$HOME decides the verdict, so each case runs against a home whose .npmrc it controls
rather than the one this machine happens to have.

Run: python3 hooks/security/tests/npm_safe_install_test.py
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "npm_safe_install.py"

# The value alone, so the assertion survives jq switching between -c and pretty output.
# Asserting on the value rather than on any output at all: PreToolUse reads only
# allow / deny / ask / defer, and a decision written with anything else fails schema
# validation and lets the install run.
DENY_MARK = '"deny"'


class TestNpmSafeInstall(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory(prefix="npm-safe-install-tests-")
        root = Path(cls.tmpdir.name)
        cls.home_unset = root / "unset"
        cls.home_configured = root / "configured"
        cls.home_unset.mkdir()
        cls.home_configured.mkdir()
        (cls.home_configured / ".npmrc").write_text("ignore-scripts=true\n", encoding="utf-8")
        cls.root = root

    @classmethod
    def tearDownClass(cls):
        cls.tmpdir.cleanup()

    def run_hook(self, home, command):
        payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
            env=dict(os.environ, HOME=str(home)),
        )
        return result.stdout

    def assert_denied(self, home, command):
        with self.subTest(command=command):
            self.assertIn(DENY_MARK, self.run_hook(home, command), "deny を返さない")

    def assert_allowed(self, home, command):
        with self.subTest(command=command):
            self.assertNotIn(DENY_MARK, self.run_hook(home, command), "deny を返す")

    def assert_empty(self, home, command):
        with self.subTest(command=command):
            self.assertEqual(self.run_hook(home, command), "", "何かを返す")

    def test_install_without_the_setting_is_denied(self):
        """T-001 ignore-scripts=true が無い状態の install は止める"""
        self.assert_denied(self.home_unset, "npm install")
        self.assert_denied(self.home_unset, "pnpm add zod")
        self.assert_denied(self.home_unset, "yarn upgrade")
        self.assert_denied(self.home_unset, "ni")

    def test_install_after_another_command_is_denied(self):
        """T-002 先頭に別のコマンドが立つ install も止める"""
        # 先頭トークンだけを見ると cd が読まれ、install がスキャンに届かない。
        self.assert_denied(self.home_unset, "cd /tmp && npm install")
        self.assert_denied(self.home_unset, "cd /tmp\nnpm install")

    def test_extra_spacing_is_denied(self):
        """T-003 語の間の空白が 2 つでも止める"""
        self.assert_denied(self.home_unset, "npm  install")

    def test_option_before_the_subcommand_is_denied(self):
        """T-009 subcommand の前に立つオプションを飛ばして判定する"""
        # 値を取るフラグは次のトークンを飲むので、飛ばし方を誤ると /tmp が subcommand になる。
        self.assert_denied(self.home_unset, "npm --prefix /tmp install")
        self.assert_denied(self.home_unset, "npm --silent install")

    def test_fetch_and_run_is_denied(self):
        """T-004 パッケージを取ってから走らせる形も止める"""
        # npx は実行の前にインストールするので、install script は同じように走る。
        self.assert_denied(self.home_unset, "npx create-vite my-app")
        self.assert_denied(self.home_unset, "nlx create-vite my-app")
        self.assert_denied(self.home_unset, "bunx create-vite my-app")

    def test_configured_home_passes(self):
        """T-005 ~/.npmrc に ignore-scripts=true があれば通す"""
        self.assert_allowed(self.home_configured, "npm install")
        self.assert_allowed(self.home_configured, "npx create-vite my-app")

    def test_command_side_override_is_denied(self):
        """T-006 ~/.npmrc を打ち消すフラグは設定済みでも止める"""
        # 設定はコマンド側のフラグに負けるので、設定の有無だけを見ると素通りする。
        self.assert_denied(self.home_configured, "npm install --ignore-scripts=false")
        self.assert_denied(self.home_configured, "npm install --no-ignore-scripts")

    def test_non_install_commands_are_skipped(self):
        """T-007 install しないコマンドは何も返さない"""
        self.assert_empty(self.home_unset, "npm run build")
        self.assert_empty(self.home_unset, "git status")
        self.assert_empty(self.home_unset, "npm ls --depth=0")

    def test_quoted_text_is_not_an_install(self):
        """T-008 引用符の内側にある語は install として扱わない"""
        self.assert_allowed(self.home_unset, "git commit -m 'run npm install first'")

    def test_env_assignment_does_not_hide_an_install(self):
        """T-010 先頭の環境変数代入を挟んでもインストールは止める"""
        # 代入をコマンド名として読むと npm と一致せず、install script がそのまま走る。
        self.assert_denied(self.home_unset, "FOO=1 npm install zod")

    def test_fetch_and_run_spellings_are_denied(self):
        """T-011 パッケージを取ってきて実行する別綴りも止める"""
        # npx と同じく、bin が走る前に依存ごとインストールされる。
        self.assert_denied(self.home_unset, "pnpm dlx cowsay")
        self.assert_denied(self.home_unset, "npm exec cowsay")
        self.assert_denied(self.home_unset, "bun x cowsay")
        self.assert_denied(self.home_unset, "yarn dlx cowsay")

    def test_npmrc_spacing_is_read(self):
        """T-012 npm が true と読む書き方は設定済みとして扱う"""
        # npm config get は `ignore-scripts = true` を true と解釈する。
        home = Path(tempfile.mkdtemp(dir=self.root, prefix="spaced"))
        (home / ".npmrc").write_text("ignore-scripts = true\n", encoding="utf-8")
        self.assert_allowed(home, "npm install zod")

    def test_project_npmrc_overrides_home(self):
        """T-013 プロジェクトの .npmrc が打ち消していれば止める"""
        # npm はプロジェクト側の .npmrc を後に読むので、ホーム側の true だけ見ると素通りする。
        project = Path(tempfile.mkdtemp(dir=self.root, prefix="proj"))
        (project / ".npmrc").write_text("ignore-scripts=false\n", encoding="utf-8")
        self.assert_denied(self.home_configured, f"cd {project} && npm install zod")


if __name__ == "__main__":
    unittest.main(verbosity=2)
