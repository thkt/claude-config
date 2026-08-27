#!/usr/bin/env python3
"""ablate skill における、観測された 1 アーム要素の verdict 分類。

CLI のエントリポイントではない。skills/ablate/SKILL.md はこのモジュールを script として
呼ぶのでなく、下の定数と `classify` を import して使う (docs/wiki/deterministic-script-judgment.md
「入力から一意に決まる判定は script に置く」— 判定表は SKILL.md の散文でなく、この
script の関数として持つ)。
"""

from __future__ import annotations

from arms import UNMEASURED

# 上から読んで最初に当たった行を採る。skills/census/SKILL.md Phase 4 Step 1 の
# 「上から読んで最初に当たった行を採る」判定表に倣う。このユニットの契約は keep の行を
# 置かない — 要素は「このまま残してよい」とは決して報告されず、削除候補 / 人間の価値判断
# 待ち / 未計測のいずれかにしか割り当てられない。
#
# | 条件                                                            | Verdict               |
# | ------------------------------------------------------------- | --------------------- |
# | trigger_task 未指定、task_set 未指定、または trigger_task が    | UNMEASURED            |
# | task_set に含まれない                                          |                       |
# | complies が True                                                | DELETE_CANDIDATE      |
# | complies が False                                               | NEEDS_HUMAN_JUDGMENT  |
# | それ以外 (compliance がまだ観測されていない)                    | UNMEASURED            |
DELETE_CANDIDATE = "delete-candidate"
NEEDS_HUMAN_JUDGMENT = "needs-human-judgment"


def classify(
    trigger_task: str | None = None,
    task_set: set[str] | None = None,
    complies: bool | None = None,
) -> str:
    """1 アーム要素の観測結果を、上表に従って DELETE_CANDIDATE / NEEDS_HUMAN_JUDGMENT /
    UNMEASURED のいずれかに割り当てる。トリガーとなるタスクがこの task set で一度も
    実行されていない要素は観測そのものを持たないため、その行を最初に検査し、
    `complies` の値より優先する。"""
    if task_set is None or trigger_task is None or trigger_task not in task_set:
        return UNMEASURED
    if complies is True:
        return DELETE_CANDIDATE
    if complies is False:
        return NEEDS_HUMAN_JUDGMENT
    return UNMEASURED
