#!/usr/bin/env python3
"""Usage: bootstrap.py <worktree-path>

<worktree-path> 内のプロジェクト種別を検出し、依存を install して build smoke test を
実行する。ステップごとの timeout (install 180s、build 600s) は subprocess で課すため、
timeout(1) が無いプラットフォーム (macOS 等) でも成立する。

stdout: JSON {project_type, install, build, install_cmd, build_cmd, reason}
  install: ok | fail | skip   (skip = そのプロジェクト種別に依存ステップが無い)
  build:   pass | fail | skipped
exit 0 は run 完走 (verdict は JSON から読む)、exit 1 は usage / path エラー。

Gate routing (呼び出し側、references/phase-4.md § Bootstrap Failure Handling)。三値は
build 単独ではなく (install, build) の組で決まる。

  install=fail  + build=skipped   -> env 失敗          -> Ready (caveat) 経路
  install=ok    + build=fail      -> build smoke 破損  -> NotReady
  install=ok/skip + build=skipped -> build 概念なし    -> 通常どおり前進
  install=ok/skip + build=pass    -> 問題なし          -> 通常どおり前進

build 開始後に発火した build timeout は build=fail として報告する。ハングした build は
壊れた build と区別できず、環境起因として扱うと Ready (caveat) に達してしまう
(references/phase-0.md 0b)。
"""

import json
import subprocess
import sys
from pathlib import Path

INSTALL_TIMEOUT = 180
BUILD_TIMEOUT = 600

# プロジェクト種別検出: この順で最初に一致したものを採用 (references/phase-0.md)。
PROJECT_MARKERS = [
    ("package.json", "node"),
    ("Cargo.toml", "rust"),
    ("Makefile", "make"),
    ("Taskfile.yml", "task"),
    ("pyproject.toml", "python"),
    ("Gemfile", "ruby"),
]

# lock ファイル別の npm install コマンド。最初に一致したものを採用。
NPM_LOCK_COMMANDS = [
    ("bun.lockb", ["bun", "install", "--frozen-lockfile"]),
    ("pnpm-lock.yaml", ["pnpm", "install", "--frozen-lockfile"]),
    ("yarn.lock", ["yarn", "install", "--frozen-lockfile"]),
    ("package-lock.json", ["npm", "ci"]),
]
NPM_INSTALL_DEFAULT = ["npm", "install"]

# node 以外の install コマンド。None はその種別に依存ステップが無いことを表す。
INSTALL_COMMANDS = {
    "rust": ["cargo", "fetch"],
    "make": None,
    "task": None,
    "python": ["pip", "install", "-e", "."],
    "ruby": ["bundle", "install"],
}

# build コマンド。None はその種別に build 概念が無いことを表す (build=skipped、前進)。
BUILD_COMMANDS = {
    "rust": ["cargo", "build"],
    "make": ["make", "build"],
    "task": ["task", "build"],
    "python": None,
    "ruby": None,
}


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


def detect_project_type(worktree):
    for marker, ptype in PROJECT_MARKERS:
        if (worktree / marker).is_file():
            return ptype
    return None


def install_command(worktree, ptype):
    """ptype の install コマンド (list) を返す。無ければ None。"""
    if ptype == "node":
        for lock, cmd in NPM_LOCK_COMMANDS:
            if (worktree / lock).is_file():
                return cmd
        return NPM_INSTALL_DEFAULT
    return INSTALL_COMMANDS.get(ptype)


def build_command(worktree, ptype):
    """ptype の build コマンド (list) を返す。build 概念が無ければ None。

    node では package.json に scripts.build がある場合のみ build ステップが存在する。
    無ければ build 概念は無く build は skip される。
    """
    if ptype == "node":
        if _has_npm_build_script(worktree):
            return ["npm", "run", "build"]
        return None
    return BUILD_COMMANDS.get(ptype)


def _has_npm_build_script(worktree):
    try:
        pkg = json.loads((worktree / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    scripts = pkg.get("scripts")
    return isinstance(scripts, dict) and bool(scripts.get("build"))


# 「ステップが timeout した」ことを表す sentinel exit code。
TIMED_OUT = object()


def _real_runner(cmd, cwd, timeout):
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


def run(worktree, runner=_real_runner):
    """検出・install・build を行う。結果 dict を返す (ステップ失敗では raise しない)。"""
    ptype = detect_project_type(worktree)
    result = {
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


def main():
    if len(sys.argv) != 2:
        fail("Usage: bootstrap.py <worktree-path>")
    worktree = Path(sys.argv[1])
    if not worktree.is_dir():
        fail(f"Error: not a directory: {worktree}")
    print(json.dumps(run(worktree)))


if __name__ == "__main__":
    main()
