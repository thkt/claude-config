"""Integration tests for hooks/pre-bash/auto_package_manager.py (PreToolUse hook).

The hook exits early unless `ni` resolves, and CI installs no ni. A stub on PATH keeps
the conversion reachable there; without it every case would exit 0 and pass vacuously.

Run: python3 hooks/pre-bash/tests/auto_package_manager_test.py
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "auto_package_manager.py"


class TestAutoPackageManager(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory(prefix="auto-package-manager-tests-")
        stub_bin = Path(cls.tmpdir.name) / "bin"
        stub_bin.mkdir()
        ni = stub_bin / "ni"
        ni.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        ni.chmod(0o755)
        cls.env = dict(os.environ, PATH=f"{stub_bin}{os.pathsep}{os.environ['PATH']}")

    @classmethod
    def tearDownClass(cls):
        cls.tmpdir.cleanup()

    def run_hook(self, command):
        payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            check=False,
            env=self.env,
        )
        return result.stdout

    # The rewritten command alone, so each assertion states the conversion instead of the
    # JSON around it. T-013 covers the envelope.
    def converted(self, command):
        out = self.run_hook(command)
        if not out.strip():
            return ""
        return json.loads(out).get("hookSpecificOutput", {}).get("updatedInput", {}).get("command", "")

    def assert_converted(self, expected, command):
        with self.subTest(command=command):
            self.assertEqual(self.converted(command), expected)

    def assert_left_alone(self, command):
        with self.subTest(command=command):
            self.assertEqual(self.run_hook(command), "")

    def test_install_becomes_ni(self):
        """T-001 install / i / add は ni になる"""
        self.assert_converted("ni", "npm install")
        self.assert_converted("ni", "npm i")
        self.assert_converted("ni zod", "npm install zod")
        self.assert_converted("ni zod", "pnpm add zod")

    def test_fetch_and_run_becomes_nlx(self):
        """T-002 npx / bunx は nlx になる"""
        self.assert_converted("nlx create-vite my-app", "npx create-vite my-app")
        self.assert_converted("nlx create-vite my-app", "bunx create-vite my-app")

    def test_run_becomes_nr(self):
        """T-003 run は nr になる"""
        self.assert_converted("nr build", "npm run build")
        self.assert_converted("nr dev --port 3000", "pnpm run dev --port 3000")

    def test_test_and_start_keep_the_script_name(self):
        """T-004 test / t / start は script 名を残して nr になる"""
        self.assert_converted("nr test", "npm test")
        self.assert_converted("nr test", "npm t")
        self.assert_converted("nr test --watch", "npm test --watch")
        self.assert_converted("nr start", "npm start")

    def test_clean_install_becomes_nci(self):
        """T-005 ci は nci になる"""
        self.assert_converted("nci", "npm ci")

    def test_update_becomes_nup(self):
        """T-006 update / up / upgrade は nup になる"""
        self.assert_converted("nup", "npm update")
        self.assert_converted("nup", "yarn upgrade")
        self.assert_converted("nup zod", "npm update zod")

    def test_uninstall_becomes_nun(self):
        """T-007 uninstall / remove / rm / un は nun になる"""
        self.assert_converted("nun zod", "npm uninstall zod")
        self.assert_converted("nun zod", "yarn remove zod")

    def test_exec_becomes_nlx(self):
        """T-008 exec / dlx / x は nlx になる"""
        self.assert_converted("nlx vite", "npm exec vite")
        self.assert_converted("nlx vite", "pnpm dlx vite")
        self.assert_converted("nlx vite", "bun x vite")

    def test_subcommand_without_arguments_is_left_alone(self):
        """T-009 引数を取らない exec / uninstall は書き換えない"""
        # 変換先が引数を必須とするので、空のまま渡すと壊れたコマンドを押し付けることになる。
        self.assert_left_alone("npm exec")
        self.assert_left_alone("npm uninstall")

    def test_bare_package_manager_becomes_ni(self):
        """T-010 subcommand の無いパッケージマネージャは ni になる"""
        self.assert_converted("ni", "yarn")
        self.assert_converted("ni", "bun")

    def test_unknown_subcommand_goes_to_na(self):
        """T-011 知らない subcommand は na へ委譲する"""
        self.assert_converted("na publish", "npm publish")
        self.assert_converted("na config get registry", "npm config get registry")

    def test_other_commands_are_left_alone(self):
        """T-012 パッケージマネージャ以外のコマンドは書き換えない"""
        self.assert_left_alone("git status")
        self.assert_left_alone("ls -la")
        # 先頭トークンだけを見るので、後ろに現れる npm は対象にならない。
        self.assert_left_alone("cd /tmp && npm install")

    def test_output_matches_the_pretooluse_shape(self):
        """T-013 書き換えるときの出力が PreToolUse の形に従う"""
        # permissionDecision は allow / deny / ask / defer 以外を書くと schema 検証で落ち、
        # updatedInput ごと捨てられる。
        # 空を {} に倒す。json.loads を直接呼ぶと、何も返さない hook では例外がメソッドごと
        # 落として下の 3 つが走らず、独立に数えていた sh 版より検出が減る。
        raw = self.run_hook("npm install")
        out = json.loads(raw).get("hookSpecificOutput", {}) if raw.strip() else {}
        with self.subTest("hookEventName"):
            self.assertEqual(out.get("hookEventName"), "PreToolUse")
        with self.subTest("permissionDecision"):
            self.assertEqual(out.get("permissionDecision"), "allow")
        with self.subTest("reason names the source"):
            self.assertIn("npm", out.get("permissionDecisionReason", ""))

    def test_manager_flags_are_left_alone(self):
        """T-014 マネージャ自身のフラグは subcommand として扱わない"""
        # na へ渡すと ni 自身の情報が返り、尋ねたマネージャの情報は出ない。
        for command in ("npm --version", "npm -v", "pnpm --version", "yarn --version", "bun --help"):
            self.assert_left_alone(command)

    def test_bun_test_runner_is_left_alone(self):
        """T-015 bun 内蔵のテストランナーは書き換えない"""
        # nr test が走らせるのは package.json の test スクリプトで、別のものが動く。
        self.assert_left_alone("bun test")
        self.assert_left_alone("bun t")

    def test_bun_package_subcommands_still_convert(self):
        """T-016 パッケージ操作としての bun は従来どおり変換する"""
        self.assert_converted("ni zod", "bun add zod")
        self.assert_converted("ni", "bun install")
        self.assert_converted("nr build", "bun run build")
        self.assert_converted("nun zod", "bun remove zod")
        self.assert_converted("nup", "bun update")
        self.assert_converted("nlx cowsay", "bun x cowsay")

    def test_run_without_a_script_name_is_left_alone(self):
        """T-017 スクリプト名の無い run は書き換えない"""
        self.assert_left_alone("npm run")

    def test_manager_specific_subcommands_go_to_na(self):
        """T-018 マネージャ固有の subcommand は na へ委譲する"""
        # na は検出したエージェントへ原語のまま渡すので、bun にしか無い形も bun へ届く。
        self.assert_converted("na pm ls", "bun pm ls")
        self.assert_converted("na build ./app.ts", "bun build ./app.ts")
        self.assert_converted("na index.ts", "bun index.ts")
        self.assert_converted("na repl", "bun repl")


if __name__ == "__main__":
    unittest.main(verbosity=2)
