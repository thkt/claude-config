#!/usr/bin/env python3
# pyright: reportUninitializedInstanceVariable=false
# setUp fills these per test, which is where a unittest fixture belongs. The rule asks for a
# class-body assignment or __init__ instead, neither of which can hold a per-test temp dir.
# The class-body annotations still carry the types.
"""Tests for workflows/build/revalidate.py (the deterministic Revalidate verifier).

Run: python3 workflows/build/tests/revalidate_test.py

run() is exercised directly against a tempdir; the CLI contract (stdin JSON ->
stdout {results}, fail-closed exit 1 on a bad payload) is exercised via subprocess.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from collections.abc import Sequence
from pathlib import Path
from typing import cast, override

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "revalidate.py"
sys.path.insert(0, str(HERE.parent))

import revalidate  # noqa: E402  (sys.path must be set first)

# One result row read as (exists, matches), keyed by (path, pattern).
Verdict = tuple[str | bool, str | bool]


class RunTest(unittest.TestCase):
    # Declared here because setUp fills them: an attribute first seen inside a method
    # carries no type for a checker.
    _tmp: tempfile.TemporaryDirectory[str]
    root: Path

    @override
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        _ = (self.root / "present.js").write_text(
            "export const sampleSymbol = 1;\n", encoding="utf-8"
        )

    def verdicts(self, preconditions: Sequence[object]) -> dict[Verdict, Verdict]:
        return {
            (r["path"], r["pattern"]): (r["exists"], r["matches"])
            for r in revalidate.run(preconditions, self.root)
        }

    def test_pattern_present_matches(self) -> None:
        v = self.verdicts([{"path": "present.js", "pattern": "sampleSymbol"}])
        self.assertEqual(v[("present.js", "sampleSymbol")], (True, True))

    def test_pattern_absent_does_not_match(self) -> None:
        v = self.verdicts([{"path": "present.js", "pattern": "goneSymbol"}])
        # File exists but the literal is not there: exists true, matches false -> drift.
        self.assertEqual(v[("present.js", "goneSymbol")], (True, False))

    def test_missing_file(self) -> None:
        v = self.verdicts([{"path": "missing.js", "pattern": "anything"}])
        self.assertEqual(v[("missing.js", "anything")], (False, False))

    def test_no_pattern_tracks_existence(self) -> None:
        v = revalidate.run([{"path": "present.js"}, {"path": "missing.js"}], self.root)
        self.assertEqual((v[0]["exists"], v[0]["matches"]), (True, True))
        self.assertEqual((v[1]["exists"], v[1]["matches"]), (False, False))

    def test_directory_is_not_a_file(self) -> None:
        (self.root / "adir").mkdir()
        v = revalidate.run([{"path": "adir"}], self.root)
        self.assertEqual((v[0]["exists"], v[0]["matches"]), (False, False))

    def test_order_and_count_preserved(self) -> None:
        pre = [
            {"path": "present.js", "pattern": "sampleSymbol"},
            {"path": "missing.js", "pattern": "x"},
            {"path": "present.js"},
        ]
        results = revalidate.run(pre, self.root)
        self.assertEqual(len(results), 3)
        self.assertEqual([r["path"] for r in results], ["present.js", "missing.js", "present.js"])

    def test_none_pattern_normalized_to_empty_string(self) -> None:
        results = revalidate.run([{"path": "present.js", "pattern": None}], self.root)
        # REVALIDATE_SCHEMA requires pattern to be a string; None becomes "".
        self.assertEqual(results[0]["pattern"], "")
        self.assertTrue(results[0]["matches"])

    def test_pattern_is_literal_not_regex(self) -> None:
        # The docstring promises fixed-string matching. A regex metachar pattern must
        # match only its literal text, so a regression to re.search would fail here.
        _ = (self.root / "cfg.js").write_text("const x = cfg[0].bar;\n", encoding="utf-8")
        v = self.verdicts(
            [
                {"path": "cfg.js", "pattern": "cfg[0]"},  # present literally
                {
                    "path": "cfg.js",
                    "pattern": "c.g",
                },  # regex would match "cfg"; literal absent
            ]
        )
        self.assertEqual(v[("cfg.js", "cfg[0]")], (True, True))
        self.assertEqual(v[("cfg.js", "c.g")], (True, False))

    def test_malformed_entry_is_fail_closed_and_count_preserved(self) -> None:
        # build.js binds results to preconditions; a non-dict entry must not crash or
        # drop a result (which would break that binding), just resolve to false/false.
        results = revalidate.run(
            [{"path": "present.js", "pattern": "sampleSymbol"}, "not-a-dict", None],
            self.root,
        )
        self.assertEqual(len(results), 3)
        self.assertEqual((results[1]["exists"], results[1]["matches"]), (False, False))
        self.assertEqual((results[2]["exists"], results[2]["matches"]), (False, False))


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

    def test_stdin_to_stdout_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            _ = (Path(tmp) / "f.txt").write_text("has anchor here", encoding="utf-8")
            proc = self._run(json.dumps([{"path": "f.txt", "pattern": "anchor"}]), cwd=tmp)
            self.assertEqual(proc.returncode, 0)
            out = cast("object", json.loads(proc.stdout))
            self.assertEqual(
                out,
                {
                    "results": [
                        {
                            "path": "f.txt",
                            "pattern": "anchor",
                            "exists": True,
                            "matches": True,
                        }
                    ]
                },
            )

    def test_empty_array_yields_empty_results(self) -> None:
        proc = self._run("[]")
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(cast("object", json.loads(proc.stdout)), {"results": []})

    def test_invalid_json_fails_closed(self) -> None:
        proc = self._run("not json")
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(proc.stdout, "")

    def test_non_array_payload_fails_closed(self) -> None:
        proc = self._run(json.dumps({"path": "x"}))
        self.assertEqual(proc.returncode, 1)


if __name__ == "__main__":
    _ = unittest.main()
