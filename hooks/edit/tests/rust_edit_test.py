# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/edit/rust_pre_edit.py and rust_post_edit.py.

cargo is replaced by a stub on PATH: the assertions read what the hooks do with clippy's
output rather than compiling a real crate.

Run: python3 hooks/edit/tests/rust_edit_test.py
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import override

HOOK_DIR = Path(__file__).resolve().parents[1]

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_lib"))

import hook_harness  # noqa: E402

PRE = HOOK_DIR / "rust_pre_edit.py"
POST = HOOK_DIR / "rust_post_edit.py"

# Records the subcommand it was called with, and prints findings for two files so the
# ordering assertion has something to reorder.
STUB_CARGO = """#!/bin/sh
echo "$1" >> "$CARGO_CALLS"
[ "$1" = "clippy" ] || exit 0
[ -n "$CARGO_SILENT" ] && exit 0
echo "src/other.rs:1:1: warning: unused variable"
echo "src/other.rs:2:1: warning: needless return"
echo "src/lib.rs:9:1: warning: this looks like the edited file"
exit 0
"""


class TestRustEdit(unittest.TestCase):
    tmpdir: tempfile.TemporaryDirectory[str]
    repo: Path
    calls: Path
    env: dict[str, str]

    @override
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory(prefix="rust-edit-tests-")
        self.addCleanup(self.tmpdir.cleanup)
        root = Path(self.tmpdir.name)

        self.repo = root / "repo"
        (self.repo / "src").mkdir(parents=True)
        _ = subprocess.run(["git", "-C", str(self.repo), "init", "-q"], check=True)
        (self.repo / "src" / "lib.rs").touch()
        (self.repo / "src" / "other.rs").touch()

        stub_bin = root / "bin"
        stub_bin.mkdir()
        stub = stub_bin / "cargo"
        _ = stub.write_text(STUB_CARGO, encoding="utf-8")
        stub.chmod(0o755)

        self.calls = root / "calls"
        self.calls.touch()
        self.env = {
            **os.environ,
            "PATH": f"{stub_bin}{os.pathsep}{os.environ['PATH']}",
            "CARGO_CALLS": str(self.calls),
        }
        # Every assertion below that expects silence also passes when cargo is unreachable,
        # which is what a replaced (rather than merged) env produces.
        self.assertEqual(shutil.which("cargo", path=self.env["PATH"]), str(stub))

    def run_hook(self, hook: Path, path: Path | str, **env: str) -> str:
        payload = {"tool_name": "Edit", "tool_input": {"file_path": str(path)}}
        return hook_harness.run(hook, payload, {**self.env, **env})

    def cargo_calls(self) -> list[str]:
        return self.calls.read_text(encoding="utf-8").split()

    def test_a_non_rust_edit_never_starts_cargo(self) -> None:
        """T-001: An edit to anything but .rs does not launch cargo"""
        self.assertEqual(self.run_hook(PRE, self.repo / "README.md"), "")
        self.assertEqual(self.cargo_calls(), [])

    def test_a_rust_file_outside_a_repo_is_skipped(self) -> None:
        """T-002: A .rs outside git control is out of scope"""
        loose = Path(self.tmpdir.name) / "loose.rs"
        loose.touch()
        self.assertEqual(self.run_hook(PRE, loose), "")
        self.assertEqual(self.cargo_calls(), [])

    def test_the_edited_file_findings_come_first(self) -> None:
        """T-003: Findings for the edited file lead the list"""
        # clippy reads the whole workspace, so trimming can drop the file that was edited.
        out = self.run_hook(PRE, self.repo / "src" / "lib.rs")
        context = json.loads(out)["hookSpecificOutput"]["additionalContext"]
        self.assertIn("src/lib.rs", context.splitlines()[0])

    def test_pre_edit_declares_its_event(self) -> None:
        """T-004: It returns as a PreToolUse"""
        out = self.run_hook(PRE, self.repo / "src" / "lib.rs")
        self.assertEqual(json.loads(out)["hookSpecificOutput"]["hookEventName"], "PreToolUse")

    def test_post_edit_formats_then_lints(self) -> None:
        """T-005: After an edit, fmt runs and then clippy returns"""
        out = self.run_hook(POST, self.repo / "src" / "lib.rs")
        self.assertEqual(self.cargo_calls(), ["fmt", "clippy"])
        self.assertEqual(json.loads(out)["hookSpecificOutput"]["hookEventName"], "PostToolUse")

    def test_a_clean_clippy_says_nothing(self) -> None:
        """T-006: With no finding it returns nothing"""
        # Injecting an empty additionalContext hands the reader nothing.
        out = self.run_hook(PRE, self.repo / "src" / "lib.rs", CARGO_SILENT="1")
        self.assertEqual(out, "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
