#!/usr/bin/env python3
# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Tests for workflows/build/verify-tests.py (deterministic test-statement presence).

Run: python3 workflows/build/tests/verify_tests_test.py

run() is exercised directly against a temp tree; the CLI contract (stdin JSON ->
stdout JSON, fail-closed exit 1 on a bad payload) is exercised via subprocess.
"""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from collections.abc import Sequence
from pathlib import Path
from typing import cast, override

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "verify-tests.py"
# verify-tests.py has a hyphen, so load it by path rather than import name.
_spec = importlib.util.spec_from_file_location("verify_tests", SCRIPT)
assert _spec is not None and _spec.loader is not None
verify_tests = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verify_tests)


class RunTest(unittest.TestCase):
    # Declared here because setUp fills them: an attribute first seen inside a method
    # carries no type for a checker.
    _tmp: tempfile.TemporaryDirectory[str]
    root: Path

    @override
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        _ = (self.root / "foo.test.js").write_text(
            'test("rejects negative amounts", () => {});\n'
        )
        _ = (self.root / "foo.js").write_text("export const foo = 1;\n")

    @override
    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _run(self, checks: Sequence[object]) -> list[dict[str, object]]:
        # Loaded by path because the filename has a hyphen, which leaves its attributes Any.
        return cast(
            "list[dict[str, object]]",
            verify_tests.run(checks, root=self.root),  # pyright: ignore[reportAny]
        )

    def test_verbatim_statement_in_a_unit_file_is_found(self) -> None:
        results = self._run(
            [{"files": ["foo.js", "foo.test.js"], "names": ["rejects negative amounts"]}]
        )
        self.assertEqual(results, [{"name": "rejects negative amounts", "found": True}])

    def test_statement_absent_from_every_unit_file_is_not_found(self) -> None:
        results = self._run(
            [{"files": ["foo.js", "foo.test.js"], "names": ["accepts zero amounts"]}]
        )
        self.assertEqual(results, [{"name": "accepts zero amounts", "found": False}])

    def test_statement_spaced_by_textlint_matches_the_unspaced_test_name(self) -> None:
        # The issue body carries "0 件" (textlint spaces half- and full-width); the test
        # file's string literal carries "0件".
        _ = (self.root / "gate.test.js").write_text(
            'test("issues が0件の run の gate は Ready のままになる", () => {});\n'
        )
        results = self._run(
            [
                {
                    "files": ["gate.test.js"],
                    "names": ["issues が 0 件の run の gate は Ready のままになる"],
                }
            ]
        )
        self.assertEqual(results[0]["found"], True)

    def test_statement_split_across_lines_still_matches(self) -> None:
        # Whitespace is dropped from the whole file, so a formatter's line break inside
        # a test name still counts as present.
        _ = (self.root / "wrapped.test.js").write_text(
            'test(\n  "rejects negative\n  amounts",\n  () => {},\n);\n'
        )
        results = self._run(
            [{"files": ["wrapped.test.js"], "names": ["rejects negative amounts"]}]
        )
        self.assertEqual(results[0]["found"], True)

    def test_whitespace_only_statement_is_not_found(self) -> None:
        results = self._run([{"files": ["foo.test.js"], "names": ["   "]}])
        self.assertEqual(results[0]["found"], False)

    def test_missing_file_fails_closed_to_not_found(self) -> None:
        results = self._run([{"files": ["gone.test.js"], "names": ["rejects negative amounts"]}])
        self.assertEqual(results, [{"name": "rejects negative amounts", "found": False}])

    def test_search_is_scoped_to_the_units_own_files(self) -> None:
        # The statement exists in foo.test.js, but this unit only lists foo.js:
        # presence in another unit's file must not count.
        results = self._run([{"files": ["foo.js"], "names": ["rejects negative amounts"]}])
        self.assertEqual(results, [{"name": "rejects negative amounts", "found": False}])

    def test_names_flatten_across_units_in_input_order(self) -> None:
        results = self._run(
            [
                {"files": ["foo.test.js"], "names": ["rejects negative amounts"]},
                {"files": ["foo.js"], "names": ["accepts zero amounts"]},
            ]
        )
        self.assertEqual(
            [r["name"] for r in results],
            ["rejects negative amounts", "accepts zero amounts"],
        )

    def test_non_dict_entry_is_skipped_without_crashing(self) -> None:
        results = self._run(
            ["bare string", {"files": ["foo.test.js"], "names": ["rejects negative amounts"]}]
        )
        self.assertEqual(len(results), 1)


class CliTest(unittest.TestCase):
    def _run(self, stdin: str, cwd: str | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=stdin,
            capture_output=True,
            text=True,
            cwd=cwd,
            check=False,
        )

    def test_stdin_to_stdout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            _ = (Path(tmp) / "a.test.js").write_text("statement here\n")
            proc = self._run(
                json.dumps([{"files": ["a.test.js"], "names": ["statement here"]}]),
                cwd=tmp,
            )
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(
            cast("object", json.loads(proc.stdout)),
            {"results": [{"name": "statement here", "found": True}]},
        )

    def test_invalid_json_fails_closed(self) -> None:
        proc = self._run("not json")
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(proc.stdout, "")

    def test_non_array_fails_closed(self) -> None:
        proc = self._run('{"files": []}')
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(proc.stdout, "")


if __name__ == "__main__":
    _ = unittest.main()
