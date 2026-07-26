#!/bin/zsh
# Rust: run cargo fmt after editing .rs files
set +e

source "$(cd "$(dirname "$0")" && pwd)/lib/rust-target.sh"

root=$(rust_target_root) || exit 0
cd "$root" && cargo fmt 2>/dev/null || true
