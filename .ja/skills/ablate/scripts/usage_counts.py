#!/usr/bin/env python3
"""ablate skill における、要素ごとのフック発火回数と最終使用日の集計。

呼び出し側が渡す transcript ルート(実行側の `projects/` ディレクトリ)配下の各セッション
transcript を読み、ハーネス要素ごとに PreToolUse/PostToolUse フックが何回その要素名を
発火させたかと、直近に発火した日付を数える。

計測窓と rare-by-design の集合は SKILL.md の散文でなく、この script の定数として持つ
(docs/wiki/deterministic-script-judgment.md)。
"""

from __future__ import annotations

import json
import re
import sys
from collections.abc import Iterator
from datetime import date, datetime
from pathlib import Path, PurePosixPath
from typing import TypedDict

from arms import UNMEASURED
from verdict import DELETE_CANDIDATE, NEEDS_HUMAN_JUDGMENT

# plan の契約は "hookSpecificOutput" レコードにも触れている。このセッションでサンプリング
# した attachment はそのキーを 1 件も持たなかったため、推測で読まず読み込みを見送る。
FIRE_EVENTS = frozenset({"PreToolUse", "PostToolUse"})

# `command` は harness が起動したときの前置きを持つ。`.claude` ディレクトリを通る path か、
# 展開されなかった plugin 変数から始まる path のどちらかになる。一方 harness 要素は repo
# ルート相対で名指すため、前置きを落とさないと RARE_BY_DESIGN も harness_elements の集合も
# 1 件も一致しない。
_CLAUDE_DIR_MARKER = "/.claude/"
_VARIABLE_PREFIX_RE = re.compile(r"^\$\{[A-Z_]+\}/")

# 要素として数える拡張子。`command` には path でなくラベルを載せる発火もあり
# (実測した transcript では "formatter"、"gates changed"、"guardrails...")、どの harness 要素
# も名指していないため集計から外す。
ELEMENT_SUFFIXES = frozenset({".py", ".sh", ".js"})

# 稀な入力でのみ働く安全網。ここで発火回数 0 を「未使用」と読んではならない。
# hooks/security/rm_to_trash.py は破壊的なコマンドが試みられたときのみ発火する
# ("Failure mode: fail-closed (security enforcement)") ため、ほとんどのセッションで
# 一度も発火しない。
RARE_BY_DESIGN: frozenset[str] = frozenset({"hooks/security/rm_to_trash.py"})

# `now` から遡って何日以内の直近発火を「観測済み」と数えるか。この窓を過ぎると、古い
# last-used 日付を生かしたまま報告するのでなく、その要素を未計測として報告する。
MEASUREMENT_WINDOW_DAYS = 90


class ElementUsage(TypedDict):
    fires: int
    # 直近に発火した日付(ISO 形式 YYYY-MM-DD)。その要素が一度も発火していなければ None。
    last_used: str | None


class UsageResult(TypedDict):
    elements: dict[str, ElementUsage]
    transcript_count: int
    date_range: dict[str, str | None]


def element_path(command: str) -> str | None:
    """`command` が発火させた要素の repo ルート相対 path。どの要素も名指していないとき None。

    接頭辞を落としたうえで、残りが ELEMENT_SUFFIXES の拡張子を持つときだけ path として扱う。
    絶対 path や、展開されなかった変数を頭に残す値は、repo ルート相対へ落とせないため None。
    """
    text = command.strip()
    cut = text.find(_CLAUDE_DIR_MARKER)
    text = text[cut + len(_CLAUDE_DIR_MARKER) :] if cut != -1 else _VARIABLE_PREFIX_RE.sub("", text)
    if not text or text[0] in "~$/":
        return None
    if PurePosixPath(text).suffix not in ELEMENT_SUFFIXES:
        return None
    return text


def _parse_date(timestamp: str) -> date | None:
    """transcript のタイムスタンプ("2026-08-01T00:00:00.000Z")が指す暦日。値が ISO の
    日付で始まっていない場合は None を返す(report.py 自身の行単位の許容と同じく、1 件の
    壊れたレコードが読み込み全体を止めてはならない)。"""
    try:
        return datetime.strptime(timestamp[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _iter_fires(path: Path) -> Iterator[tuple[str, date]]:
    """1 つの transcript ファイル内の PreToolUse/PostToolUse 発火レコードごとに
    (element_path, fire_date) を yield する。壊れたレコードや欠けたレコードは例外を送出せず
    何も生まない。読んでいる間も別プロセスが transcript を書き続けるため、末尾行が途中で
    切れているのは想定内。"""
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(record, dict):
                continue
            attachment = record.get("attachment")
            if not isinstance(attachment, dict):
                continue
            if attachment.get("hookEvent") not in FIRE_EVENTS:
                continue
            command = attachment.get("command")
            timestamp = record.get("timestamp")
            if not isinstance(command, str) or not isinstance(timestamp, str):
                continue
            element = element_path(command)
            if element is None:
                continue
            fire_date = _parse_date(timestamp)
            if fire_date is None:
                continue
            yield element, fire_date


def count_usage(root: Path) -> UsageResult:
    """`root` 配下のすべての `*.jsonl` transcript を走査し、要素ごとに発火を集計する。
    要素の key は element_path が返す repo ルート相対 path。"""
    transcripts = sorted(root.glob("**/*.jsonl"))
    elements: dict[str, ElementUsage] = {}
    fire_dates: list[date] = []

    for transcript in transcripts:
        try:
            fires = list(_iter_fires(transcript))
        except OSError:
            # 読めない transcript が 1 件あっても、残りの集計を止めてはならない。
            continue
        for element, fire_date in fires:
            entry = elements.setdefault(element, {"fires": 0, "last_used": None})
            entry["fires"] += 1
            if entry["last_used"] is None or fire_date.isoformat() > entry["last_used"]:
                entry["last_used"] = fire_date.isoformat()
            fire_dates.append(fire_date)

    if fire_dates:
        date_range: dict[str, str | None] = {
            "start": min(fire_dates).isoformat(),
            "end": max(fire_dates).isoformat(),
        }
    else:
        date_range = {"start": None, "end": None}

    return {
        "elements": elements,
        "transcript_count": len(transcripts),
        "date_range": date_range,
    }


# 上から読んで最初に当たった行を採る。順序は 2 箇所で意味を持つ。RARE_BY_DESIGN を発火 0 の
# 行より上に置くことで、稀な要素が DELETE_CANDIDATE に達することはない。last_used の
# チェックを `fires > 0` の下に置くのは、発火回数 0 が必ず last_used=None と対になるためで、
# これより上に置くと発火 0 の要素をすべて UNMEASURED へ飲み込み、DELETE_CANDIDATE へ
# 到達できなくなる。
#
# | 条件 | Verdict |
# | --- | --- |
# | path が RARE_BY_DESIGN に含まれる | NEEDS_HUMAN_JUDGMENT |
# | fires > 0 かつ last_used が None(入力として矛盾している) | UNMEASURED |
# | fires > 0 かつ last_used が MEASUREMENT_WINDOW_DAYS の外側 | UNMEASURED |
# | fires > 0 かつ last_used が MEASUREMENT_WINDOW_DAYS の内側 | NEEDS_HUMAN_JUDGMENT |
# | fires == 0 | DELETE_CANDIDATE |
def classify(path: str, *, fires: int, last_used: str | None, now: date) -> str:
    """1 要素の使用状況の観測結果へ、上表に従って verdict を割り当てる。RARE_BY_DESIGN と
    MEASUREMENT_WINDOW_DAYS はキャプチャしたデフォルト値でなくモジュール名前空間から読む
    ため、実行時にどちらかを patch するとこの関数が返す verdict も変わる。"""
    if path in RARE_BY_DESIGN:
        return NEEDS_HUMAN_JUDGMENT
    if fires > 0:
        if last_used is None:
            return UNMEASURED
        if (now - date.fromisoformat(last_used)).days > MEASUREMENT_WINDOW_DAYS:
            return UNMEASURED
        return NEEDS_HUMAN_JUDGMENT
    return DELETE_CANDIDATE


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: usage_counts.py <transcripts-root>", file=sys.stderr)
        return 2
    result = count_usage(Path(argv[1]))
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
