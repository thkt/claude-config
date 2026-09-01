#!/usr/bin/env python3
"""Usage: bootstrap.py <worktree-path>

<worktree-path> 内のプロジェクト種別を検出し、依存を install して build smoke test を
実行する。ステップごとの timeout (install 180s、build 600s) は subprocess で課すため、
timeout(1) が無いプラットフォーム (macOS 等) でも成立する。

stdout: JSON {project_type, install, build, install_cmd, build_cmd, reason}
  install: ok | fail | skip   (skip = そのプロジェクト種別に依存ステップが無い)
  build:   pass | fail | skipped
exit 0 は run 完走 (verdict は JSON から読む)、exit 1 は usage / path エラー。

Gate routing (呼び出し側、assert.js の envFail / buildCol 規則)。三値は
build 単独ではなく (install, build) の組で決まる。

  install=fail  + build=skipped   -> env 失敗          -> Ready (caveat) 経路
  install=ok    + build=fail      -> build smoke 破損  -> NotReady
  install=ok/skip + build=skipped -> build 概念なし    -> 通常どおり前進
  install=ok/skip + build=pass    -> 問題なし          -> 通常どおり前進

build 開始後に発火した build timeout は build=fail として報告する。ハングした build は
壊れた build と区別できず、環境起因として扱うと Ready (caveat) に達してしまう
。
"""

import json
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import NoReturn, cast

INSTALL_TIMEOUT = 180
BUILD_TIMEOUT = 600

# この順で最初に一致した種別を採用する。
PROJECT_MARKERS = [
    ("package.json", "node"),
    ("Cargo.toml", "rust"),
    ("Makefile", "make"),
    ("Taskfile.yml", "task"),
    ("pyproject.toml", "python"),
    ("Gemfile", "ruby"),
]

# 最初に一致した lock ファイルのコマンドを採用する。
NPM_LOCK_COMMANDS = [
    ("bun.lockb", ["bun", "install", "--frozen-lockfile"]),
    ("bun.lock", ["bun", "install", "--frozen-lockfile"]),
    ("pnpm-lock.yaml", ["pnpm", "install", "--frozen-lockfile"]),
    ("yarn.lock", ["yarn", "install", "--frozen-lockfile"]),
    ("package-lock.json", ["npm", "ci"]),
]
NPM_INSTALL_DEFAULT = ["npm", "install"]

# None はその種別に依存ステップが無いことを表す。
INSTALL_COMMANDS = {
    "rust": ["cargo", "fetch"],
    "make": None,
    "task": None,
    "python": ["pip", "install", "-e", "."],
    "ruby": ["bundle", "install"],
}

# None はその種別に build 概念が無いことを表す (build=skipped、前進)。
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


# runner の戻りを int でなく object にするのは、timeout の目印を同じ経路で返すため。
# int の sentinel は実在の exit code と衝突する。
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
    """ステップの失敗では raise せず、結果 dict に載せる。"""
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
