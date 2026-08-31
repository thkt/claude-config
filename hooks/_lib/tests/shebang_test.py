"""Tests for the shebang every hooks/ script launched by its raw path needs.

Run: python3 hooks/_lib/tests/shebang_test.py

settings.json registers a hook by its bare path (`~/.claude/hooks/.../foo.py`), so the
kernel resolves the interpreter straight from the shebang line -- it never sees the mise
shim on PATH. `hooks/_lib/scribe_trigger.py`'s DEFAULT_GH already reads a PATH-sensitive
binary by absolute path for the same reason (settings.json runs on a truncated PATH); this
module applies the same fix to the python3 on line 1. Docs: docs/wiki/silent-hook-failure.md
(#534) -- a hook without the execute bit does not start at all when settings.json names it
directly, unlike a sibling with the bit set.

Files are discovered by scanning `hooks/` through git, the way mirror_prose_test.py's
MirrorSweep scans `.ja/`, so a hook added later is covered without anyone adding it here.
"""

import json
import subprocess
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SHEBANG = "#!/opt/homebrew/bin/python3"
STALE_SHEBANG = "#!/usr/bin/env python3"
EXEC_MODE = "100755"


def _tracked_entries(pattern: str) -> list[tuple[str, Path]]:
    """(git file mode, absolute path) for every tracked file under REPO matching a pathspec."""
    result = subprocess.run(
        ["git", "-C", str(REPO), "ls-files", "-s", "--", pattern],
        check=True,
        capture_output=True,
        text=True,
    )
    entries: list[tuple[str, Path]] = []
    for line in result.stdout.splitlines():
        if not line:
            continue
        meta, rel = line.split("\t", 1)
        mode = meta.split(" ", 1)[0]
        entries.append((mode, REPO / rel))
    return entries


def _first_line(path: Path) -> str:
    with path.open("r", encoding="utf-8") as handle:
        return handle.readline().rstrip("\n")


def _settings_command_scripts() -> list[Path]:
    """.py paths settings.json names as a hook command, resolved from ~/.claude to REPO."""
    settings = json.loads((REPO / "settings.json").read_text(encoding="utf-8"))
    scripts: list[Path] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            command = node.get("command")
            if isinstance(command, str):
                for token in command.split():
                    if token.startswith("~/.claude/") and token.endswith(".py"):
                        scripts.append(REPO / token.removeprefix("~/.claude/"))
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(settings.get("hooks", {}))
    return scripts


class ExecutableShebang(unittest.TestCase):
    def test_T_001(self) -> None:
        """T-001 `hooks/` 配下で実行ビットが立っている追跡 `.py` すべてが1行目に `#!/opt/homebrew/bin/python3` を持つ"""
        offenders = [
            str(path.relative_to(REPO))
            for mode, path in _tracked_entries("hooks/*.py")
            if mode == EXEC_MODE and _first_line(path) != SHEBANG
        ]
        self.assertEqual(
            offenders, [], f"executable hooks/ .py files with the wrong shebang: {offenders}"
        )


class NoStaleShebang(unittest.TestCase):
    def test_T_002(self) -> None:
        """T-002 `hooks/` 配下の追跡ファイルに `#!/usr/bin/env python3` の行が1件も残らない"""
        offenders: list[str] = []
        for _mode, path in _tracked_entries("hooks/*"):
            if not path.is_file():
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            if STALE_SHEBANG in text.splitlines():
                offenders.append(str(path.relative_to(REPO)))
        self.assertEqual(
            offenders, [], f"hooks/ files still carrying #!/usr/bin/env python3: {offenders}"
        )


class SettingsCommandShebang(unittest.TestCase):
    def test_T_003(self) -> None:
        """T-003 `settings.json` が command として名指す `.py` すべてが実行ビットを持ち、1行目が T-001 と同じシェバンである"""
        tracked_modes = {path: mode for mode, path in _tracked_entries("hooks/*.py")}
        offenders: list[str] = []
        for path in _settings_command_scripts():
            mode = tracked_modes.get(path)
            ready = mode == EXEC_MODE and path.is_file() and _first_line(path) == SHEBANG
            if not ready:
                offenders.append(str(path.relative_to(REPO)))
        self.assertEqual(
            offenders,
            [],
            f"settings.json-named .py hooks missing the exec bit or the shebang: {offenders}",
        )


class LibHasNoShebang(unittest.TestCase):
    def test_T_004(self) -> None:
        """T-004 `hooks/_lib/` 配下の追跡 `.py` がシェバン行を持たない"""
        offenders = [
            str(path.relative_to(REPO))
            for _mode, path in _tracked_entries("hooks/_lib/*.py")
            if _first_line(path).startswith("#!")
        ]
        self.assertEqual(
            offenders, [], f"hooks/_lib/ .py files carrying a shebang line: {offenders}"
        )


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
