#!/usr/bin/env python3
"""ablate skill のためのアームコマンド構築と実行結果の判定。

CLI のエントリポイントではない。skills/ablate/SKILL.md はこのモジュールを script として
呼ぶのでなく、下の定数と関数を import して使う (docs/wiki/deterministic-script-judgment.md
「閾値は script が持つ」— アームの数、実行回数、合格閾値は SKILL.md の散文でなく、この
script の定数として持つ)。
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

# ablation の比較対象となる 3 アーム (skills/ablate のユニット目標)。呼び出し側が「全アーム」
# を必要とするとき、3 つの名前を手で書き写すのでなくこの定数を読むために tuple で持つ
# (docs/wiki/harness-production-divergence.md: 供給の一覧は散文の契約でなく実行側の定数)。
WIPED = "wiped"
WIPED_PLUS_ONE = "wiped+1"
FULL_HARNESS = "full-harness"
ARMS = (WIPED, WIPED_PLUS_ONE, FULL_HARNESS)

# すべてのアームが起点とする非対話実行。--print で非対話モードにし、--output-format json で
# テキストの書き起こしでなく解析可能な結果を得る
# (https://docs.claude.com/en/docs/claude-code/cli-reference で確認済み)。
BASE_COMMAND = ["claude", "--print", "--output-format", "json"]

# judge_runs が判定を返すまでに要する wiped アームの実行回数。5 は単発ノイズに対する暫定の
# 下限で、最初の ablation 実行のばらつきを測ったら見直す (同じ暫定の形は
# skills/scribe/scripts/triage.py の COMMIT_CAP を参照)。
RUN_COUNT = 5

# judge_runs が遵守をどちらかに定めるために、wiped アームの実行のうち揃わなければならない
# 割合。これを下回る実行はノイズなので、judge_runs は None を返し、割れた結果から verdict を
# 選ぶのでなく、その要素を unmeasured として読ませる。
PASS_THRESHOLD = 0.8

UNMEASURED = "unmeasured"


def arm_command(arm: str, task: str, element: str | None = None, root: Path | None = None) -> list[str]:
    """1 アーム分の CLI コマンド。`task` をプロンプトとして持つ。

    wiped は設定の読み込みをプロジェクト由来のみに制限する (--setting-sources project)。
    これが ablation の基準点になる。wiped+1 は同じ基準点から始め、通常の発見的読み込みで
    再読み込みするのでなく、harness の要素をちょうど 1 つだけ、そのファイルの本文を system
    prompt へ追記して復元する (--append-system-prompt)。これで 2 アームの差は測定対象の要素
    だけになる。full-harness は制限フラグなしでそのまま走らせ、上限側の比較点とする。
    """
    command = list(BASE_COMMAND)
    if arm in (WIPED, WIPED_PLUS_ONE):
        command += ["--setting-sources", "project"]
    if arm == WIPED_PLUS_ONE:
        if element is None or root is None:
            raise ValueError(f"arm {WIPED_PLUS_ONE!r} requires an element to restore and its root")
        restored = (root / element).read_text(encoding="utf-8")
        command += ["--append-system-prompt", f"# {element}\n\n{restored}"]
    command.append(task)
    return command


def judge_runs(runs: Sequence[bool]) -> bool | None:
    """wiped アーム 1 本の run ごとの遵守を、verdict.classify が受け取る `complies` へ畳む。
    RUN_COUNT と PASS_THRESHOLD は (関数に捕獲された既定値でなく) モジュール名前空間から
    読むため、実行時にどちらかを下げると、判定が付く run 列が変わる。

    | 条件                                         | 結果   |
    | -------------------------------------------- | ------ |
    | run 数が RUN_COUNT 未満                      | None   |
    | True の run の割合が PASS_THRESHOLD 以上     | True   |
    | False の run の割合が PASS_THRESHOLD 以上    | False  |
    | それ以外 (run が割れている)                  | None   |
    """
    if len(runs) < RUN_COUNT:
        return None
    share = sum(1 for run in runs if run) / len(runs)
    if share >= PASS_THRESHOLD:
        return True
    if 1 - share >= PASS_THRESHOLD:
        return False
    return None
