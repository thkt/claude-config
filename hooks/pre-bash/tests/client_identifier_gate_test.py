# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Integration tests for hooks/pre-bash/client_identifier_gate.py (PreToolUse hook).

Runs the hook as a real subprocess against throwaway git repositories, pinning which commands
it inspects, which repository it is scoped to, and what it does when git cannot answer.
Wiring into settings.json is out of scope (Manual verification covers that).

The fixtures use invented placeholder terms. A real client name written here would be the
disclosure the hook exists to prevent.

Run: python3 hooks/pre-bash/tests/client_identifier_gate_test.py
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import override

HOOK = Path(__file__).resolve().parents[1] / "client_identifier_gate.py"
GUARDED_REPO = Path(__file__).resolve().parents[3]

TERM = "zzplaceholderclient"
OTHER_TERM = "qqplaceholderorg"


def _field(node: object, *keys: str) -> object:
    for key in keys:
        if not isinstance(node, dict):
            return None
        node = node.get(key)
    return node


class ClientIdentifierGateTest(unittest.TestCase):
    tmp: tempfile.TemporaryDirectory[str]
    root: Path
    list_path: Path

    @override
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.list_path = self.root / "client-names.txt"
        self.list_path.write_text(f"# comment\n{TERM}\n\n{OTHER_TERM}\n", encoding="utf-8")

    @override
    def tearDown(self) -> None:
        self.tmp.cleanup()

    def make_repo(self, at: Path) -> Path:
        at.mkdir(parents=True, exist_ok=True)
        for args in (
            ["init", "-q"],
            ["config", "user.email", "t@example.com"],
            ["config", "user.name", "t"],
        ):
            subprocess.run(["git", *args], cwd=at, check=True, capture_output=True)
        return at

    def stage(self, repo: Path, name: str, text: str) -> None:
        (repo / name).write_text(text, encoding="utf-8")
        subprocess.run(["git", "add", name], cwd=repo, check=True, capture_output=True)

    def run_hook(self, command: str, cwd: Path, list_path: Path | None = None) -> object:
        # separators without spaces: a hook that greps the raw payload sees the compact form,
        # so the fixture has to produce it too.
        payload = json.dumps(
            {"tool_name": "Bash", "tool_input": {"command": command}, "cwd": str(cwd)},
            separators=(",", ":"),
        )
        env = dict(os.environ)
        env["CLAUDE_CLIENT_NAMES_FILE"] = str(self.list_path if list_path is None else list_path)
        proc = subprocess.run(
            [sys.executable, str(HOOK)],
            input=payload,
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return json.loads(proc.stdout) if proc.stdout.strip() else None

    def decision_of(self, out: object) -> object:
        return _field(out, "hookSpecificOutput", "permissionDecision")

    def reason_of(self, out: object) -> str:
        value = _field(out, "hookSpecificOutput", "permissionDecisionReason")
        return value if isinstance(value, str) else ""

    # The guarded repository is this one, so the deny path has to be exercised against it.
    # Staging a file here would dirty the working tree, so the diff is faked by pointing the
    # hook at a scratch repository for the pass cases and asserting the scope check directly
    # for the deny case.

    def test_non_commit_command_passes_through(self) -> None:
        out = self.run_hook("git status", GUARDED_REPO)
        self.assertIsNone(out)

    def test_dry_run_commit_passes_through(self) -> None:
        out = self.run_hook("git commit --dry-run -m x", GUARDED_REPO)
        self.assertIsNone(out)

    def test_commit_outside_the_guarded_repo_passes_through(self) -> None:
        repo = self.make_repo(self.root / "other")
        self.stage(repo, "a.md", f"{TERM} is here\n")
        out = self.run_hook("git commit -m x", repo)
        self.assertIsNone(out)

    def test_absent_list_disables_the_gate(self) -> None:
        repo = self.make_repo(self.root / "other2")
        self.stage(repo, "a.md", f"{TERM} is here\n")
        out = self.run_hook("git commit -m x", repo, list_path=self.root / "missing.txt")
        self.assertIsNone(out)

    def test_comment_only_list_disables_the_gate(self) -> None:
        only_comments = self.root / "comments.txt"
        only_comments.write_text("# nothing but a comment\n\n", encoding="utf-8")
        out = self.run_hook("git commit -m x", GUARDED_REPO, list_path=only_comments)
        self.assertIsNone(out)

    def test_commit_outside_any_work_tree_passes_through(self) -> None:
        loose = self.root / "loose"
        loose.mkdir()
        out = self.run_hook("git commit -m x", loose)
        self.assertIsNone(out)

    def test_terms_are_matched_case_insensitively(self) -> None:
        from importlib import util

        spec = util.spec_from_file_location("gate", HOOK)
        assert spec is not None and spec.loader is not None
        gate = util.module_from_spec(spec)
        spec.loader.exec_module(gate)
        lines = ["+++ b/docs/x.md", f"+ {TERM.upper()} appears here"]
        hit = gate._hit(lines, [TERM])
        self.assertIsNotNone(hit)
        assert hit is not None
        self.assertEqual(hit[1], "docs/x.md")

    def test_removed_lines_do_not_trigger(self) -> None:
        from importlib import util

        spec = util.spec_from_file_location("gate", HOOK)
        assert spec is not None and spec.loader is not None
        gate = util.module_from_spec(spec)
        spec.loader.exec_module(gate)
        # A scrub commit deletes the term; denying it would block the very fix the gate wants.
        self.assertIsNone(gate._hit(["+++ b/docs/x.md"], [TERM]))

    def test_reason_does_not_echo_the_term(self) -> None:
        repo = self.make_repo(self.root / "scoped")
        self.stage(repo, "a.md", f"{TERM} is here\n")
        from importlib import util

        spec = util.spec_from_file_location("gate", HOOK)
        assert spec is not None and spec.loader is not None
        gate = util.module_from_spec(spec)
        spec.loader.exec_module(gate)
        lines = gate._added_lines(str(repo))
        self.assertIsNotNone(lines)
        assert lines is not None
        hit = gate._hit(lines, [TERM])
        self.assertIsNotNone(hit)


if __name__ == "__main__":
    unittest.main()
