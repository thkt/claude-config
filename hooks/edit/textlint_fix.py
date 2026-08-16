#!/usr/bin/env python3
"""PostToolUse hook: auto-fix a Japanese .md file with textlint.

The rules are Japanese-specific, so an English document would be rewritten against a grammar
it does not follow.

settings.json narrows this to .md paths with an `if` condition. The suffix check below
repeats it so the hook still holds when called directly, as the tests do.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))

import textlint
from hook_payload import edited_file
from japanese import has_japanese

path = edited_file(sys.stdin.read())
if path is None or not path.endswith(".md"):
    sys.exit(0)

target = Path(path)
if not target.is_file():
    sys.exit(0)

if has_japanese(target.read_text(encoding="utf-8", errors="replace")):
    textlint.fix(path)
