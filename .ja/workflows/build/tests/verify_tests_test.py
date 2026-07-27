#!/usr/bin/env python3
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
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "verify-tests.py"
# verify-tests.py has a hyphen, so load it by path rather than import name.
_spec = importlib.util.spec_from_file_location("verify_tests", SCRIPT)
verify_tests = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verify_tests)


class RunTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        (self.root / "foo.test.js").write_text(
            'test("rejects negative amounts", () => {});\n'
        )
        (self.root / "foo.js").write_text("export const foo = 1;\n")

    def tearDown(self):
        self._tmp.cleanup()

    def _run(self, checks):
        return verify_tests.run(checks, root=self.root)

    def test_verbatim_statement_in_a_unit_file_is_found(self):
        results = self._run(
            [{"files": ["foo.js", "foo.test.js"], "names": ["rejects negative amounts"]}]
        )
        self.assertEqual(results, [{"name": "rejects negative amounts", "found": True}])

    def test_statement_absent_from_every_unit_file_is_not_found(self):
        results = self._run(
            [{"files": ["foo.js", "foo.test.js"], "names": ["accepts zero amounts"]}]
        )
        self.assertEqual(results, [{"name": "accepts zero amounts", "found": False}])

    def test_missing_file_fails_closed_to_not_found(self):
        results = self._run([{"files": ["gone.test.js"], "names": ["rejects negative amounts"]}])
        self.assertEqual(results, [{"name": "rejects negative amounts", "found": False}])

    def test_search_is_scoped_to_the_units_own_files(self):
        # The statement exists in foo.test.js, but this unit only lists foo.js:
        # presence in another unit's file must not count.
        results = self._run([{"files": ["foo.js"], "names": ["rejects negative amounts"]}])
        self.assertEqual(results, [{"name": "rejects negative amounts", "found": False}])

    def test_names_flatten_across_units_in_input_order(self):
        results = self._run(
            [
                {"files": ["foo.test.js"], "names": ["rejects negative amounts"]},
                {"files": ["foo.js"], "names": ["accepts zero amounts"]},
            ]
        )
        self.assertEqual([r["name"] for r in results], [
            "rejects negative amounts",
            "accepts zero amounts",
        ])

    def test_non_dict_entry_is_skipped_without_crashing(self):
        results = self._run(["bare string", {"files": ["foo.test.js"], "names": ["rejects negative amounts"]}])
        self.assertEqual(len(results), 1)


class CliTest(unittest.TestCase):
    def _run(self, stdin, cwd=None):
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=stdin,
            capture_output=True,
            text=True,
            cwd=cwd,
        )

    def test_stdin_to_stdout(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "a.test.js").write_text("statement here\n")
            proc = self._run(
                json.dumps([{"files": ["a.test.js"], "names": ["statement here"]}]),
                cwd=tmp,
            )
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(
            json.loads(proc.stdout),
            {"results": [{"name": "statement here", "found": True}]},
        )

    def test_invalid_json_fails_closed(self):
        proc = self._run("not json")
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(proc.stdout, "")

    def test_non_array_fails_closed(self):
        proc = self._run('{"files": []}')
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(proc.stdout, "")


if __name__ == "__main__":
    unittest.main()
