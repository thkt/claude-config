#!/usr/bin/env python3
"""Rust: cargo clippy before editing .rs files, injected as additionalContext."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))

import rust_target

found = rust_target.target(sys.stdin.read())
if found is None:
    sys.exit(0)

output = rust_target.clippy_output("PreToolUse", *found)
if output:
    print(output)
