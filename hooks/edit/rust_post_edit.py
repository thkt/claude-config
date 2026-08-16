#!/usr/bin/env python3
"""Rust: cargo fmt after editing .rs files, then clippy.

The pre-edit run cannot see what the edit itself broke.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))

import rust_target

found = rust_target.target(sys.stdin.read())
if found is None:
    sys.exit(0)

root, file = found
rust_target.fmt(root)
output = rust_target.clippy_output("PostToolUse", root, file)
if output:
    print(output)
