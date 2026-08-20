#!/usr/bin/env python3
"""Usage: bootstrap.py <worktree-path>

Detect the project type inside <worktree-path>, install dependencies, and run a
build smoke test. Per-step timeouts (install 180s, build 600s) are enforced via
subprocess so the result holds on platforms without timeout(1) (e.g. macOS).

stdout: JSON {project_type, install, build, install_cmd, build_cmd, reason}
  install: ok | fail | skip   (skip = project type has no dependency step)
  build:   pass | fail | skipped
exit 0 on a completed run (read the verdict from JSON); exit 1 on usage / path error.

Gate routing (caller, references/phase-4.md § Bootstrap Failure Handling). The
trichotomy is encoded by (install, build) jointly, not by build alone:

  install=fail  + build=skipped  -> env failure         -> Ready (caveat) path
  install=ok    + build=fail     -> build smoke broken  -> NotReady
  install=ok/skip + build=skipped -> no build concept          -> proceed normally
  install=ok/skip + build=pass    -> clean                     -> proceed normally

A build timeout that fires after the build started is reported as build=fail: a
hanging build is indistinguishable from a broken one, and treating it as
environmental would let it reach Ready (caveat) (references/phase-0.md 0b).
"""

import json
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import NoReturn, cast

INSTALL_TIMEOUT = 180
BUILD_TIMEOUT = 600

# First match in this order wins (references/phase-0.md).
PROJECT_MARKERS = [
    ("package.json", "node"),
    ("Cargo.toml", "rust"),
    ("Makefile", "make"),
    ("Taskfile.yml", "task"),
    ("pyproject.toml", "python"),
    ("Gemfile", "ruby"),
]

# First matching lock file wins.
NPM_LOCK_COMMANDS = [
    ("bun.lockb", ["bun", "install", "--frozen-lockfile"]),
    ("bun.lock", ["bun", "install", "--frozen-lockfile"]),
    ("pnpm-lock.yaml", ["pnpm", "install", "--frozen-lockfile"]),
    ("yarn.lock", ["yarn", "install", "--frozen-lockfile"]),
    ("package-lock.json", ["npm", "ci"]),
]
NPM_INSTALL_DEFAULT = ["npm", "install"]

# None means the type has no dependency step.
INSTALL_COMMANDS = {
    "rust": ["cargo", "fetch"],
    "make": None,
    "task": None,
    "python": ["pip", "install", "-e", "."],
    "ruby": ["bundle", "install"],
}

# None means the type has no build concept (build=skipped, proceed).
BUILD_COMMANDS = {
    "rust": ["cargo", "build"],
    "make": ["make", "build"],
    "task": ["task", "build"],
    "python": None,
    "ruby": None,
}


def fail(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    sys.exit(1)


def detect_project_type(worktree: Path) -> str | None:
    for marker, ptype in PROJECT_MARKERS:
        if (worktree / marker).is_file():
            return ptype
    return None


def install_command(worktree: Path, ptype: str) -> list[str] | None:
    if ptype == "node":
        for lock, cmd in NPM_LOCK_COMMANDS:
            if (worktree / lock).is_file():
                return cmd
        return NPM_INSTALL_DEFAULT
    return INSTALL_COMMANDS.get(ptype)


def build_command(worktree: Path, ptype: str) -> list[str] | None:
    if ptype == "node":
        if _has_npm_build_script(worktree):
            return ["npm", "run", "build"]
        return None
    return BUILD_COMMANDS.get(ptype)


def _has_npm_build_script(worktree: Path) -> bool:
    try:
        raw = cast("object", json.loads((worktree / "package.json").read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(raw, dict):
        return False
    scripts = cast("dict[str, object]", raw).get("scripts")
    if not isinstance(scripts, dict):
        return False
    return bool(cast("dict[str, object]", scripts).get("build"))


# The runner returns object rather than int so the timeout marker travels the same
# return path; an int sentinel would collide with a real exit code.
TIMED_OUT = object()

Runner = Callable[[Sequence[str], Path, int], object]


def _real_runner(cmd: Sequence[str], cwd: Path, timeout: int) -> object:
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            timeout=timeout,
            capture_output=True,
            text=True,
            check=False,
        )
        return proc.returncode
    except subprocess.TimeoutExpired:
        return TIMED_OUT
    except FileNotFoundError:
        return 127


def run(worktree: Path, runner: Runner = _real_runner) -> dict[str, str | None]:
    """A step failure never raises; it lands in the result dict."""
    ptype = detect_project_type(worktree)
    result: dict[str, str | None] = {
        "project_type": ptype,
        "install": "skip",
        "build": "skipped",
        "install_cmd": None,
        "build_cmd": None,
        "reason": "",
    }
    if ptype is None:
        result["reason"] = "project-type-unknown"
        return result

    install_cmd = install_command(worktree, ptype)
    if install_cmd is not None:
        result["install_cmd"] = " ".join(install_cmd)
        rc = runner(install_cmd, worktree, INSTALL_TIMEOUT)
        if rc is TIMED_OUT:
            result["install"] = "fail"
            result["reason"] = "env:install-timeout"
            return result
        if rc != 0:
            result["install"] = "fail"
            result["reason"] = f"env:install-exit-{rc}"
            return result
        result["install"] = "ok"

    build_cmd = build_command(worktree, ptype)
    if build_cmd is None:
        result["reason"] = "no-build-script"
        return result

    result["build_cmd"] = " ".join(build_cmd)
    rc = runner(build_cmd, worktree, BUILD_TIMEOUT)
    if rc is TIMED_OUT:
        result["build"] = "fail"
        result["reason"] = "build-timeout"
        return result
    if rc != 0:
        result["build"] = "fail"
        result["reason"] = f"build-exit-{rc}"
        return result
    result["build"] = "pass"
    return result


def main() -> None:
    if len(sys.argv) != 2:
        fail("Usage: bootstrap.py <worktree-path>")
    worktree = Path(sys.argv[1])
    if not worktree.is_dir():
        fail(f"Error: not a directory: {worktree}")
    print(json.dumps(run(worktree)))


if __name__ == "__main__":
    main()
