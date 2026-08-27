#!/usr/bin/env python3
"""PostToolUse hook: report rumdl violations after editing a .md file.

The pre-edit run cannot see what the edit itself broke. Unlike textlint_fix.py, this hook
only reports; it never calls `rumdl fmt`, so a fix stays a decision the human or the agent
makes on purpose.
"""

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

from hook_payload import edited_file

path = edited_file(sys.stdin.read())
if path is None or not path.endswith(".md"):
    sys.exit(0)

if not Path(path).is_file():
    sys.exit(0)

try:
    result = subprocess.run(
        ["rumdl", "check", path],
        capture_output=True,
        text=True,
        check=False,
    )
except FileNotFoundError:
    sys.exit(0)

output = result.stdout.strip()
if output:
    print(output)
