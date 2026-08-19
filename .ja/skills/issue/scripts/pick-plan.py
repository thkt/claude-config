#!/usr/bin/env python3
"""Usage: pick-plan.py <issue-title | plan-path> [planning-dir]

plan 下書きの節を逐語で切り出し、パスが分からないときは候補を順位付けする。

`.plan.md` のパスを渡すとそのファイルだけを切り出す。会話が /think の書いた下書きを
持っている通常の経路がこれに当たる。

タイトルを渡すとディレクトリを順位付けする。slug は /think へ渡したタイトルから作られ、
issue のタイトルは別に書かれるので、文字列としては一致しない。順位付けは共通語の数で行い、
単独で得点した下書きがあるときだけ選ぶ。同点は推測で決めず、呼び出し側へ返す。

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

DEFAULT_DIR = Path(".claude/workspace/planning")
# /think は YYYY-MM-DD-<slug>.plan.md で書く。日付が名前にあるので、issue skill に許された
# どの道具も返せない mtime を読まずに新しい順が決まる。
NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)\.plan\.md$")
SECTION = re.compile(r"^## (.+?)\s*$", flags=re.MULTILINE)


def slugify(title: str) -> str:
    """タイトルを /think の slug の形へ落とす。小文字、ハイフン区切り。

    型の接頭辞は先に落とす。`[Feature] Add CSV export` は add-csv-export で書かれるので、
    角括弧を残すとどのタイトルも自分の下書きに当たらなくなる。
    """
    text = unicodedata.normalize("NFKC", title)
    text = re.sub(r"^\[[A-Za-z]+\]\s*", "", text)
    text = re.sub(r"[^\w\s-]", " ", text, flags=re.UNICODE)
    return "-".join(text.lower().split())


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


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: pick-plan.py <issue-title> [planning-dir]", file=sys.stderr)
        sys.exit(1)
    argument = sys.argv[1]
    directory = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_DIR

    given = Path(argument)
    if given.suffix == ".md" and given.is_file():
        text = given.read_text(encoding="utf-8")
        parsed = NAME.match(given.name)
        print(
            json.dumps(
                {
                    "path": str(given),
                    "slug": parsed.group(2) if parsed else None,
                    "date": parsed.group(1) if parsed else None,
                    "plan": section(text, "Plan"),
                    "backlog": section(text, "Backlog candidates"),
                    "candidates": [],
                    "ambiguous": False,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    wanted = slugify(argument)

    words = {w for w in wanted.split("-") if len(w) > 2}
    rows = []
    if directory.is_dir():
        for entry in sorted(directory.iterdir()):
            parsed = NAME.match(entry.name)
            if not parsed:
                continue
            slug = parsed.group(2)
            score = len(words & {w for w in slug.split("-") if len(w) > 2})
            rows.append({"path": str(entry), "slug": slug, "date": parsed.group(1), "score": score})
    rows.sort(key=lambda r: (-r["score"], r["date"]), reverse=False)
    rows.sort(key=lambda r: (r["score"], r["date"]), reverse=True)

    scored = [r for r in rows if r["score"] > 0]
    top = [r for r in scored if r["score"] == scored[0]["score"]] if scored else []
    result: dict[str, object] = {
        "path": None,
        "slug": None,
        "date": None,
        "plan": None,
        "backlog": None,
        "candidates": rows,
        "ambiguous": len(top) > 1,
    }
    if len(top) == 1:
        chosen = Path(top[0]["path"])
        text = chosen.read_text(encoding="utf-8")
        result.update(
            path=top[0]["path"],
            slug=top[0]["slug"],
            date=top[0]["date"],
            plan=section(text, "Plan"),
            backlog=section(text, "Backlog candidates"),
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
