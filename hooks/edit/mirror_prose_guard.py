#!/usr/bin/env python3
"""PostToolUse hook: warn when a file under .ja/ carries prose with no Japanese in it.

Warns, never blocks: a file whose comments are legitimately all identifiers or proper nouns
has no Japanese to find, and that is not a defect.

settings.json narrows this to .ja/ paths with an `if` condition. mirror_prose.is_target repeats
that check for the sweep test, which calls it without going through settings.json.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

import mirror_prose

mirror_prose.emit(sys.stdin.read())
