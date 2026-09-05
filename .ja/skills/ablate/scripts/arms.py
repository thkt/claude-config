#!/usr/bin/env python3
"""ablate skill のためのアームコマンド構築と実行回数の判定。

CLI のエントリポイントではない。skills/ablate/SKILL.md はこのモジュールを script として
呼ぶのでなく、下の定数と関数を import して使う (docs/wiki/deterministic-script-judgment.md
「閾値は script が持つ」— アームの数、実行回数、合格閾値は SKILL.md の散文でなく、この
script の定数として持つ)。
"""

from __future__ import annotations

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

# 1 アームの結果を measured とみなすまでに要する実行回数。5 は単発ノイズに対する暫定の下限で、
# 最初の ablation 実行のばらつきを測ったら見直す (同じ暫定の形は
# skills/scribe/scripts/triage.py の COMMIT_CAP を参照)。
RUN_COUNT = 5

# 1 アームが合格と判定されるために、harness ありの挙動を再現しなければならない実行の割合。
# docs/wiki/deterministic-script-judgment.md に倣い、この数値を SKILL.md の散文でなくここに
# 1 箇所だけ持つ。
PASS_THRESHOLD = 0.8

UNMEASURED = "unmeasured"
MEASURED = "measured"


def arm_command(arm: str, element: str | None = None) -> list[str]:
    """1 アーム分の CLI コマンド。

    wiped は設定の読み込みをプロジェクト由来のみに制限する (--setting-sources project)。
    これが ablation の基準点になる。wiped+1 は同じ基準点から始め、通常の発見的読み込みで
    再読み込みするのでなく、harness の要素をちょうど 1 つだけ system prompt へ追記して復元
    する (--append-system-prompt) — これがこのユニットの実装する契約
    (「wiped は --setting-sources project、復元は --append-system-prompt で作る」)。
    full-harness は制限フラグなしでそのまま走らせ、上限側の比較点とする。
    """
    command = list(BASE_COMMAND)
    if arm in (WIPED, WIPED_PLUS_ONE):
        command += ["--setting-sources", "project"]
    if arm == WIPED_PLUS_ONE:
        if element is None:
            raise ValueError(f"arm {WIPED_PLUS_ONE!r} requires an element to restore")
        command += ["--append-system-prompt", f"[ablate] restoring element: {element}"]
    return command


def measurement_status(runs: int) -> str:
    """アームが RUN_COUNT 回に達したら MEASURED、それ以外は UNMEASURED。RUN_COUNT は
    (関数に捕獲された既定値でなく) モジュール名前空間から読むため、実行時にこの定数を
    下げると、既に集まっている実行回数のうち measured と報告されるものが変わる。"""
    return MEASURED if runs >= RUN_COUNT else UNMEASURED
