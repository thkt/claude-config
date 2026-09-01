"""Tests for skills/census/scripts/list-source-files.py.

Run: python3 skills/census/tests/list_source_files_test.py
"""

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "list-source-files.py"

_spec = importlib.util.spec_from_file_location("list_source_files", SCRIPT)
assert _spec is not None and _spec.loader is not None
list_source_files = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(list_source_files)


def _touch(root: Path, rel: str, lines: int = 1) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x\n" * lines, encoding="utf-8")


def _run(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(root)], capture_output=True, text=True, check=False
    )


class SourceCap(unittest.TestCase):
    def test_a_tree_within_the_cap_exits_zero_with_no_stderr(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for i in range(list_source_files.SOURCE_CAP):
                _touch(root, f"src/f{i}.py")

            result = _run(root)

        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stderr, "")
        self.assertEqual(len(result.stdout.splitlines()), list_source_files.SOURCE_CAP)

    def test_a_tree_over_the_cap_still_lists_every_file_and_exits_over_cap(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            count = list_source_files.SOURCE_CAP + 1
            for i in range(count):
                _touch(root, f"src/f{i}.py")

            result = _run(root)

        self.assertEqual(result.returncode, list_source_files.EXIT_OVER_CAP)
        self.assertIn(f"SOURCE_CAP={list_source_files.SOURCE_CAP}", result.stderr)
        self.assertEqual(len(result.stdout.splitlines()), count)


class Pruning(unittest.TestCase):
    def test_mirror_and_build_directories_are_left_out(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _touch(root, "src/kept.py")
            for pruned in list_source_files.PRUNE:
                _touch(root, f"{pruned}/dropped.py")

            listed = {p.name for p in list_source_files.source_files(str(root))}

        self.assertEqual(listed, {"kept.py"})

    def test_files_are_listed_largest_first(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _touch(root, "small.py", lines=2)
            _touch(root, "large.py", lines=5)

            result = _run(root)

        names = [line.split()[1].rsplit("/", 1)[-1] for line in result.stdout.splitlines()]
        self.assertEqual(names, ["large.py", "small.py"])


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
