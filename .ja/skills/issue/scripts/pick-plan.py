#!/usr/bin/env python3
"""Usage: pick-plan.py <issue-title | plan-path> [planning-dir]

パスを渡すとその下書きの節を切り出し、タイトルを渡すと planning-dir の下書きを順位付けする。

stdout: JSON { path, slug, date, plan, backlog, candidates, ambiguous }
        path       選んだファイル。得点が 0 か同点なら null
        plan       見出しを含む `## Plan` 節。無ければ null
        backlog    見出しを含む `## Backlog candidates` 節。無ければ null
        candidates 日付の新しい順の全下書き。各 { path, slug, date, score }
        ambiguous  最高得点が複数あるとき true
exit: 一致しない場合も含めて常に 0。ディレクトリが無いのは失敗でなく不一致。planning を
      していない時点の起票は通常の経路で、skill を止めてはならない。
"""

import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import TypedDict

DEFAULT_DIR = Path(".claude/workspace/planning")
# 日付を名前から読むのは、issue skill に許されたどの道具も mtime を返さないため。
NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)\.plan\.md$")
SECTION = re.compile(r"^## (.+?)\s*$", flags=re.MULTILINE)


class Draft(TypedDict):
    """下書き 1 件と、タイトルとの共通語で付けた得点。"""

    path: str
    slug: str
    date: str
    score: int


def slugify(title: str) -> str:
    """タイトルを /think の slug の形へ落とす。小文字、ハイフン区切り。

    型の接頭辞は先に落とす。`[Feature] Add CSV export` は add-csv-export で書かれるので、
    角括弧を残すとどのタイトルも自分の下書きに当たらなくなる。
    """
    text = unicodedata.normalize("NFKC", title)
    text = re.sub(r"^\[[A-Za-z]+\]\s*", "", text)
    text = re.sub(r"[^\w\s-]", " ", text, flags=re.UNICODE)
    return "-".join(text.lower().split())


def scoring_words(slug: str) -> set[str]:
    """得点に数える語。2 字以下はどの slug にも当たるので落とす。"""
    return {w for w in slug.split("-") if len(w) > 2}


def section(text: str, name: str) -> str | None:
    """見出しを含む `## <name>` 節 1 つ。次の h2 か末尾まで。"""
    for match in SECTION.finditer(text):
        if match.group(1) != name:
            continue
        rest = text[match.end() :]
        following = SECTION.search(rest)
        body = rest[: following.start()] if following else rest
        return (match.group(0) + body).rstrip() + "\n"
    return None


def extracted(path: Path) -> dict[str, object]:
    """下書き 1 件から読む出力用の値。"""
    text = path.read_text(encoding="utf-8")
    parsed = NAME.match(path.name)
    return {
        "path": str(path),
        "slug": parsed.group(2) if parsed else None,
        "date": parsed.group(1) if parsed else None,
        "plan": section(text, "Plan"),
        "backlog": section(text, "Backlog candidates"),
    }


def rank(title: str, directory: Path) -> list[Draft]:
    """ディレクトリ内の全下書き。得点の高い順、同点なら日付の新しい順。"""
    wanted = scoring_words(slugify(title))
    rows: list[Draft] = []
    if directory.is_dir():
        for entry in sorted(directory.iterdir()):
            parsed = NAME.match(entry.name)
            if not parsed:
                continue
            slug = parsed.group(2)
            rows.append(
                {
                    "path": str(entry),
                    "slug": slug,
                    "date": parsed.group(1),
                    "score": len(wanted & scoring_words(slug)),
                }
            )
    rows.sort(key=lambda r: (r["score"], r["date"]), reverse=True)
    return rows


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: pick-plan.py <issue-title | plan-path> [planning-dir]", file=sys.stderr)
        sys.exit(1)
    directory = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_DIR

    result: dict[str, object] = {
        "path": None,
        "slug": None,
        "date": None,
        "plan": None,
        "backlog": None,
        "candidates": [],
        "ambiguous": False,
    }
    given = Path(sys.argv[1])
    if given.suffix == ".md" and given.is_file():
        result |= extracted(given)
    else:
        rows = rank(sys.argv[1], directory)
        scored = [r for r in rows if r["score"] > 0]
        top = [r for r in scored if r["score"] == scored[0]["score"]] if scored else []
        result |= {"candidates": rows, "ambiguous": len(top) > 1}
        if len(top) == 1:
            result |= extracted(Path(top[0]["path"]))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
