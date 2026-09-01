"""Tests for skills/census/scripts/list-source-files.py.

Run: python3 skills/census/tests/list_source_files_test.py

Every case drives the script through its CLI, since its contract is stdout and the exit code.
Expectations are literals written here, never read back from the module: a fixture built from
the constant under test moves with it and cannot observe a regression.
"""

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "list-source-files.py"

# The cap the script documents. Spelled out so a change to SOURCE_CAP fails here.
CAP = 20
EXIT_OVER_CAP = 3
EXIT_USAGE = 2
# The directories the script must leave out, spelled out for the same reason.
PRUNED = ["target", "node_modules", ".git", "dist", "build", ".venv", "__pycache__", ".ja"]


def _touch(root: Path, rel: str, lines: int = 1) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x\n" * lines, encoding="utf-8")


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args], capture_output=True, text=True, check=False
    )


def _names(result: subprocess.CompletedProcess[str]) -> list[str]:
    """The file names the script listed, in output order. Fixtures using it sit flat at the root."""
    return [os.path.basename(line.split(" ", 1)[1]) for line in result.stdout.splitlines()]


class SourceCap(unittest.TestCase):
    def test_a_tree_within_the_cap_exits_zero_with_no_stderr(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for i in range(CAP):
                _touch(root, f"src/f{i}.py")

            result = _run(str(root))

        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stderr, "")
        self.assertEqual(len(result.stdout.splitlines()), CAP)

    def test_a_tree_over_the_cap_still_lists_every_file_and_exits_over_cap(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for i in range(CAP + 1):
                _touch(root, f"src/f{i}.py")

            result = _run(str(root))

        self.assertEqual(result.returncode, EXIT_OVER_CAP)
        self.assertIn(f"SOURCE_CAP={CAP}", result.stderr)
        self.assertEqual(len(result.stdout.splitlines()), CAP + 1)


class Selection(unittest.TestCase):
    def test_pruned_directories_are_left_out_and_the_rest_listed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _touch(root, "src/kept.py")
            for name in PRUNED:
                _touch(root, f"{name}/dropped.py")

            result = _run(str(root))

        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, f"1 {root}/src/kept.py\n")

    def test_every_source_extension_is_listed_and_other_files_are_not(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ["a.rs", "b.ts", "c.tsx", "d.js", "e.jsx", "f.mjs", "g.cjs", "h.py", "i.go", "j.swift"]:
                _touch(root, name)
            for name in ["README.md", "notes.txt", "Cargo.toml"]:
                _touch(root, name)

            result = _run(str(root))

        self.assertEqual(
            sorted(_names(result)),
            ["a.rs", "b.ts", "c.tsx", "d.js", "e.jsx", "f.mjs", "g.cjs", "h.py", "i.go", "j.swift"],
        )

    def test_an_unreadable_file_is_skipped_while_its_siblings_are_listed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _touch(root, "ok.py")
            os.symlink(root / "missing-target.py", root / "broken.py")

            result = _run(str(root))

        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stderr, "")
        self.assertEqual(_names(result), ["ok.py"])


class Ordering(unittest.TestCase):
    def test_files_are_listed_largest_first_and_ties_by_path_ascending(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _touch(root, "small.py", lines=2)
            _touch(root, "large.py", lines=5)
            _touch(root, "b-mid.py", lines=3)
            _touch(root, "a-mid.py", lines=3)

            result = _run(str(root))

        self.assertEqual(_names(result), ["large.py", "a-mid.py", "b-mid.py", "small.py"])


class Usage(unittest.TestCase):
    def test_a_missing_argument_prints_usage_and_exits_two(self) -> None:
        result = _run()

        self.assertEqual(result.returncode, EXIT_USAGE)
        self.assertEqual(result.stdout, "")
        self.assertIn("usage:", result.stderr)

    def test_a_path_that_is_not_a_directory_exits_two_rather_than_reading_as_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = _run(str(Path(tmp) / "absent"))

        self.assertEqual(result.returncode, EXIT_USAGE)
        self.assertEqual(result.stdout, "")
        self.assertIn("not a directory", result.stderr)

    def test_an_empty_tree_exits_zero_with_empty_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = _run(tmp)

        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertEqual(result.stderr, "")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
