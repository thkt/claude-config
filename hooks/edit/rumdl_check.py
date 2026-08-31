#!/opt/homebrew/bin/python3
"""PostToolUse hook: report rumdl violations after editing a .md file.

Unlike textlint_fix.py, this hook only reports; it never calls `rumdl fmt`, so a fix stays a
decision the human or the agent makes on purpose.
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

# Not `if result.stdout`: rumdl prints "Success: No issues found in 1 file" on a clean file
# too, and forwarding that would put a line on every .md edit. The exit code is the only
# signal that separates the two.
output = result.stdout.strip()
if result.returncode != 0 and output:
    print(output)
