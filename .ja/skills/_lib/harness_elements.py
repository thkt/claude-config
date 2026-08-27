#!/usr/bin/env python3
"""Usage: harness_elements.py <repo-root>

<repo-root> 配下の harness ファイルを POPULATION_GLOBS で列挙し、それぞれを
常時ロード / パス起動 / glob 起動 / 非プロンプト のいずれかに分類する。

stdout: JSON array of { path, classification }, path は <repo-root> からの相対パス
exit: 0 (成功), 引数が無ければ 2

ゼロから書く YAML パーサではない。この環境に PyYAML は入っておらず、実在する 2 つの
frontmatter 形 (`globs: [...]` の 1 行形式と、`paths:` に続く `  - "..."` 行) は狭いので、
2 形式を手で読む方が依存を足すより小さい (rules/PRINCIPLES.md Reuse Ordering)。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import TypedDict

ALWAYS_LOADED = "always-loaded"
PATH_TRIGGERED = "path-triggered"
GLOB_TRIGGERED = "glob-triggered"
NON_PROMPT = "non-prompt"

# 母集団の供給一覧を、散文の契約でなく script の定数として持つ
# (docs/wiki/harness-production-divergence.md)。enumerate_elements はどこを見るかをこの定数
# から読み、母集団の実例が欲しいテスト (skills/_lib/tests/harness_elements_test.py) もこの
# 定数を読む。このモジュールが実際に走査する先と別のパスを手で書き写して食い違わせない。
#
# どのパターンも裸の "**" でなく最上位の具体セグメントを起点にしているため、各木の隣にある
# `.ja/` ミラーはこの glob からは辿り着けない。1 回の一致が母集団 1 要素であり、
# rules/conventions/MIRROR.md の「ファイルとその .ja ミラーは 1 要素として数える」は、後付けの
# 重複排除でなく構造として成り立つ。
POPULATION_GLOBS = (
    "rules/**/*.md",
    "docs/wiki/**/*.md",
    "CLAUDE.md",
    "skills/**/*.md",
    "skills/**/scripts/*.py",
    "agents/**/*.md",
    "hooks/**/*.py",
    "hooks/**/*.md",
)


class HarnessElement(TypedDict):
    path: str
    classification: str


def _frontmatter_lines(path: Path) -> list[str] | None:
    """開きと閉じの `---` 区切りの間の行のみを返す。frontmatter ブロックを一切持たない
    ファイルは None (空のブロックとは区別する)。"""
    lines = path.read_text(encoding="utf-8").split("\n")
    if not lines or lines[0] != "---":
        return None
    for i, line in enumerate(lines[1:], start=1):
        if line == "---":
            return lines[1:i]
    return None


def _unquote(item: str) -> str:
    if len(item) >= 2 and item[0] == item[-1] and item[0] in ("'", '"'):
        return item[1:-1]
    return item


def _read_array(lines: list[str], key: str) -> list[str]:
    """このリポジトリの harness ファイルが使う 2 つの frontmatter 配列形式のどちらも読む。
    1 行 JSON 配列 (`globs: ["a", "b"]`, docs/wiki/*.md) と、複数行の YAML ダッシュリスト
    (`paths:` に続く `  - "a"` 行, rules/**/*.md)。"""
    prefix = f"{key}:"
    for i, line in enumerate(lines):
        if not line.startswith(prefix):
            continue
        rest = line[len(prefix) :].strip()
        if rest:
            try:
                value = json.loads(rest)
            except json.JSONDecodeError:
                return []
            if not isinstance(value, list):
                return []
            return [v for v in value if isinstance(v, str)]
        items: list[str] = []
        for follow in lines[i + 1 :]:
            stripped = follow.strip()
            if not stripped.startswith("-"):
                break
            items.append(_unquote(stripped[1:].strip()))
        return items
    return []


def classify(path: Path) -> str:
    """harness ファイル 1 件を分類する。上から読んで最初に当たった行を採る
    (skills/census/SKILL.md Phase 4 と同じ判定表の形)。.md でないファイルはそもそも
    プロンプトに載らない。rules/**/*.md (またはルートの CLAUDE.md) で frontmatter を持たない
    ものは常時ロードされ、`paths` キーが非空のものはパス起動になる。docs/wiki/**/*.md の
    ページで `globs` キーが非空のものは glob 起動になる。それ以外の母集団構成員 (名前で
    呼ばれる SKILL.md、spawn 時にだけ読まれる reviewer 定義、注入でなく実行される script)
    はすべて非プロンプトになる。"""
    if path.suffix != ".md":
        return NON_PROMPT

    parts = path.parts
    lines = _frontmatter_lines(path)

    if "rules" in parts or path.name == "CLAUDE.md":
        if lines is None:
            return ALWAYS_LOADED
        if _read_array(lines, "paths"):
            return PATH_TRIGGERED
        return NON_PROMPT

    if "docs" in parts and "wiki" in parts:
        if lines is not None and _read_array(lines, "globs"):
            return GLOB_TRIGGERED
        return NON_PROMPT

    return NON_PROMPT


def enumerate_elements(root: Path) -> list[HarnessElement]:
    """POPULATION_GLOBS で root 配下を走査し、それぞれを分類する。どのパターンも
    `.ja/` へは踏み込まないため (POPULATION_GLOBS を参照)、ミラーされたファイルは
    canonical 側 1 本を通じてのみ現れる。"""
    seen: dict[str, HarnessElement] = {}
    for pattern in POPULATION_GLOBS:
        for match in root.glob(pattern):
            if not match.is_file():
                continue
            rel = match.relative_to(root).as_posix()
            if rel not in seen:
                seen[rel] = {"path": rel, "classification": classify(match)}
    return [seen[key] for key in sorted(seen)]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    elements = enumerate_elements(Path(argv[1]))
    print(json.dumps(elements, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
