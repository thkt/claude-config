"""Integration tests for hooks/pre-bash/package_manager_rewrite.py (PreToolUse hook).

The hook exits early unless `ni` resolves, and CI installs no ni. A stub on PATH keeps
the conversion reachable there; without it every case would exit 0 and pass vacuously.

Run: python3 hooks/pre-bash/tests/package_manager_rewrite_test.py
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import ClassVar, cast, override

HOOK = Path(__file__).resolve().parents[1] / "package_manager_rewrite.py"


def _field(node: object, *keys: str) -> str | None:
    """Walk a parsed JSON payload by key, returning None the moment the shape stops matching.

    isinstance narrows at each step, so the value arrives typed instead of Any.
    """
    for key in keys:
        if not isinstance(node, dict):
            return None
        node = node.get(key)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
    return node if isinstance(node, str) else None


class TestPackageManagerRewrite(unittest.TestCase):
    # Declared here rather than assigned into setUpClass alone: a type checker reads an
    # attribute that first appears inside a method as unknown on the class.
    tmpdir: ClassVar[tempfile.TemporaryDirectory[str]]
    env: ClassVar[dict[str, str]]

    @classmethod
    @override
    def setUpClass(cls) -> None:
        cls.tmpdir = tempfile.TemporaryDirectory(prefix="package-manager-rewrite-tests-")
        stub_bin = Path(cls.tmpdir.name) / "bin"
        stub_bin.mkdir()
        ni = stub_bin / "ni"
        _ = ni.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        ni.chmod(0o755)
        cls.env = dict(os.environ, PATH=f"{stub_bin}{os.pathsep}{os.environ['PATH']}")

    @classmethod
    @override
    def tearDownClass(cls) -> None:
        cls.tmpdir.cleanup()

    def run_hook(self, command: str) -> str:
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
    def converted(self, command: str) -> str:
        out = self.run_hook(command)
        if not out.strip():
            return ""
        parsed = cast(object, json.loads(out))
        return _field(parsed, "hookSpecificOutput", "updatedInput", "command") or ""

    def assert_converted(self, expected: str, command: str) -> None:
        with self.subTest(command=command):
            self.assertEqual(self.converted(command), expected)

    def assert_left_alone(self, command: str) -> None:
        with self.subTest(command=command):
            self.assertEqual(self.run_hook(command), "")

    def test_install_becomes_ni(self) -> None:
        """T-001 install / i / add become ni"""
        self.assert_converted("ni", "npm install")
        self.assert_converted("ni", "npm i")
        self.assert_converted("ni zod", "npm install zod")
        self.assert_converted("ni zod", "pnpm add zod")

    def test_fetch_and_run_becomes_nlx(self) -> None:
        """T-002 npx / bunx become nlx"""
        self.assert_converted("nlx create-vite my-app", "npx create-vite my-app")
        self.assert_converted("nlx create-vite my-app", "bunx create-vite my-app")

    def test_run_becomes_nr(self) -> None:
        """T-003 run becomes nr"""
        self.assert_converted("nr build", "npm run build")
        self.assert_converted("nr dev --port 3000", "pnpm run dev --port 3000")

    def test_test_and_start_keep_the_script_name(self) -> None:
        """T-004 test / t / start become nr, keeping the script name"""
        self.assert_converted("nr test", "npm test")
        self.assert_converted("nr test", "npm t")
        self.assert_converted("nr test --watch", "npm test --watch")
        self.assert_converted("nr start", "npm start")

    def test_clean_install_becomes_nci(self) -> None:
        """T-005 ci becomes nci"""
        self.assert_converted("nci", "npm ci")

    def test_update_becomes_nup(self) -> None:
        """T-006 update / up / upgrade become nup"""
        self.assert_converted("nup", "npm update")
        self.assert_converted("nup", "yarn upgrade")
        self.assert_converted("nup zod", "npm update zod")

    def test_uninstall_becomes_nun(self) -> None:
        """T-007 uninstall / remove / rm / un become nun"""
        self.assert_converted("nun zod", "npm uninstall zod")
        self.assert_converted("nun zod", "yarn remove zod")

    def test_exec_becomes_nlx(self) -> None:
        """T-008 exec / dlx / x become nlx"""
        self.assert_converted("nlx vite", "npm exec vite")
        self.assert_converted("nlx vite", "pnpm dlx vite")
        self.assert_converted("nlx vite", "bun x vite")

    def test_subcommand_without_arguments_is_left_alone(self) -> None:
        """T-009 An exec / uninstall taking no argument is left alone"""
        # The target form requires an argument, so passing it empty hands over a broken command.
        self.assert_left_alone("npm exec")
        self.assert_left_alone("npm uninstall")

    def test_bare_package_manager_becomes_ni(self) -> None:
        """T-010 A package manager with no subcommand becomes ni"""
        self.assert_converted("ni", "yarn")
        self.assert_converted("ni", "bun")

    def test_unknown_subcommand_goes_to_na(self) -> None:
        """T-011 An unknown subcommand is handed to na"""
        self.assert_converted("na publish", "npm publish")
        self.assert_converted("na config get registry", "npm config get registry")

    def test_other_commands_are_left_alone(self) -> None:
        """T-012 A command that is not a package manager is left alone"""
        self.assert_left_alone("git status")
        self.assert_left_alone("ls -la")
        # Only the first token is read, so an npm appearing later is out of scope.
        self.assert_left_alone("cd /tmp && npm install")

    def test_output_matches_the_pretooluse_shape(self) -> None:
        """T-013 The output of a rewrite follows the PreToolUse shape"""
        # A permissionDecision written as anything but allow / deny / ask / defer fails schema
        # validation and is dropped along with updatedInput.
        # Falls an empty output to {}. Calling json.loads straight raises on a hook returning
        # nothing, taking the method down so the three below never run, detecting less than the
        # sh version that counted them apart.
        raw = self.run_hook("npm install")
        out = cast(object, json.loads(raw)) if raw.strip() else None
        with self.subTest("hookEventName"):
            self.assertEqual(_field(out, "hookSpecificOutput", "hookEventName"), "PreToolUse")
        with self.subTest("permissionDecision"):
            self.assertEqual(_field(out, "hookSpecificOutput", "permissionDecision"), "allow")
        with self.subTest("reason names the source"):
            self.assertIn(
                "npm", _field(out, "hookSpecificOutput", "permissionDecisionReason") or ""
            )

    def test_manager_flags_are_left_alone(self) -> None:
        """T-014 A flag of the manager itself is not read as a subcommand"""
        # Handed to na it reports on ni itself, never on the manager that was asked about.
        for command in (
            "npm --version",
            "npm -v",
            "pnpm --version",
            "yarn --version",
            "bun --help",
        ):
            self.assert_left_alone(command)

    def test_bun_test_runner_is_left_alone(self) -> None:
        """T-015 The test runner built into bun is left alone"""
        # nr test runs the test script in package.json, which is a different thing.
        self.assert_left_alone("bun test")
        self.assert_left_alone("bun t")

    def test_bun_package_subcommands_still_convert(self) -> None:
        """T-016 bun as a package operation converts as before"""
        self.assert_converted("ni zod", "bun add zod")
        self.assert_converted("ni", "bun install")
        self.assert_converted("nr build", "bun run build")
        self.assert_converted("nun zod", "bun remove zod")
        self.assert_converted("nup", "bun update")
        self.assert_converted("nlx cowsay", "bun x cowsay")

    def test_run_without_a_script_name_is_left_alone(self) -> None:
        """T-017 A run with no script name is left alone"""
        self.assert_left_alone("npm run")

    def test_manager_specific_subcommands_go_to_na(self) -> None:
        """T-018 A manager-specific subcommand is handed to na"""
        # na passes the words through to the agent it detects, so a bun-only form reaches bun.
        self.assert_converted("na pm ls", "bun pm ls")
        self.assert_converted("na build ./app.ts", "bun build ./app.ts")
        self.assert_converted("na index.ts", "bun index.ts")
        self.assert_converted("na repl", "bun repl")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
