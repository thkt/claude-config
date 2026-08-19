#!/usr/bin/env python3
"""Usage: validate-issue-body.py <template-file> <title> <body-file>

stdout: JSON { errors, warnings, checks }
exit: 0 if no errors (warnings allowed), 1 if errors
"""

import json
import re
import sys
from pathlib import Path

TYPE_PREFIX = re.compile(r"^\[([A-Za-z]+)\]")
HEADING = re.compile(r"^## (.+?)\s*$", flags=re.MULTILINE)
CODE_BLOCK = re.compile(r"```(?:markdown)?\n(.*?)```", flags=re.DOTALL)
OPTIONAL_SUFFIX = re.compile(r"\s*\((?:optional|任意)\)\s*$")
FORM_SUFFIXES = (".yml", ".yaml")
FRONTMATTER = re.compile(r"\A---\n.*?\n---\n", flags=re.DOTALL)
# 骨格が何を必須としても skill が守る底。リポジトリの form が述べるのは Web UI が
# 埋めさせる最小で、起票された issue が担うべき量より薄い。これが無いと feature は
# 受け入れ条件なしで、bug は再現手順なしで通る。
FLOOR = {
    "feature": ("Acceptance Criteria", "Testing Decisions"),
    "bug": ("Steps to Reproduce", "Expected vs Actual"),
}
# 骨格に無くても errors にしない節。/think の plan を転記した issue はこの 2 節を必ず持ち、
# skills/issue/SKILL.md の Phase 3 がそれを指示している。
ALLOWED_EXTRA = frozenset({"Plan", "Backlog candidates"})


def skeleton_sections(template_text: str) -> list[tuple[str, bool]]:
    """`## Template` 直下の最初のコードブロックから読む (name, optional) の組。

    ここで次の見出しまでを取る手は使えない。骨格自体が `## ` を含む markdown なので、
    その境界は `## Guidelines` でなく骨格内の最初の見出しで止まる。コードフェンスは
    自分で閉じるため、見出しの開始位置だけを求めてその後の最初のフェンスを探す。

    `## Template` が無いのはリポジトリ自身の .github/ISSUE_TEMPLATE/<type>.md で、
    その本文がそのまま骨格になる。この分岐が無いと節を 1 つも読めず、正しい本文の
    全見出しが unknown_section になる。
    """
    heading_match = re.search(r"^## Template\s*$", template_text, flags=re.MULTILINE)
    if heading_match is None:
        skeleton = FRONTMATTER.sub("", template_text)
    else:
        code_match = CODE_BLOCK.search(template_text[heading_match.end() :])
        skeleton = code_match.group(1) if code_match else ""
    sections: list[tuple[str, bool]] = []
    names: list[str] = HEADING.findall(skeleton)
    for name in names:
        optional = bool(OPTIONAL_SUFFIX.search(name))
        bare = OPTIONAL_SUFFIX.sub("", name)
        sections.append((bare, optional))
    return sections


def form_sections(form_text: str) -> list[tuple[str, bool]]:
    """GitHub issue form (.yml) の body 要素から読む (name, optional) のペア。

    フォームは Web UI からの起票で label を見出しに変える。同じ label を CLI 起票の
    骨格にも使えば、どちらの経路で立った issue も同じ節を持つ。`validations.required`
    が真の要素だけを必須とする。

    YAML パーサは標準ライブラリに無い。issue form の body は `- type:` 区切りの平坦な
    並びで入れ子を持たないため、区切りで割ってから各断片を読む。
    """
    body_start = re.search(r"^body:\s*$", form_text, flags=re.MULTILINE)
    if body_start is None:
        return []
    entries = re.split(r"^\s*- type:\s*", form_text[body_start.end() :], flags=re.MULTILINE)[1:]
    sections: list[tuple[str, bool]] = []
    for entry in entries:
        if entry.split("\n", 1)[0].strip() == "markdown":
            continue
        label = re.search(r"^\s*label:\s*(.+?)\s*$", entry, flags=re.MULTILINE)
        if label is None:
            continue
        name = label.group(1).strip().strip("\"'")
        required = re.search(r"^\s*required:\s*true\s*$", entry, flags=re.MULTILINE) is not None
        sections.append((name, not required))
    return sections


def body_section_names(body_text: str) -> set[str]:
    """本文の節名。コードフェンスの中は数えない。

    骨格はフェンスの中身を読むが、本文でフェンスに入る `## ` は引用であって節ではない。
    数えると骨格に無い引用が unknown_section になり、正しい本文が落ちる。
    """
    outside = CODE_BLOCK.sub("", body_text)
    names: list[str] = HEADING.findall(outside)
    return {OPTIONAL_SUFFIX.sub("", name) for name in names}


def main() -> None:
    if len(sys.argv) < 4:
        print("Usage: validate-issue-body.py <template-file> <title> <body-file>", file=sys.stderr)
        sys.exit(1)
    template_path, title, body_path = sys.argv[1], sys.argv[2], sys.argv[3]

    template = Path(template_path)
    template_text = template.read_text(encoding="utf-8")
    body_text = Path(body_path).read_text(encoding="utf-8")

    results: dict[str, list[str]] = {"errors": [], "warnings": [], "checks": []}

    title_match = TYPE_PREFIX.match(title)
    template_type = template.stem
    if title_match:
        title_type = title_match.group(1).lower()
        if title_type != template_type:
            results["errors"].append(f"type_mismatch:title={title_type} template={template_type}")
        else:
            results["checks"].append(f"type_match:{title_type}=ok")
    else:
        results["errors"].append("type_mismatch:title has no bracketed type prefix")

    is_form = template.suffix in FORM_SUFFIXES
    own_template = re.search(r"^## Template\s*$", template_text, flags=re.MULTILINE) is not None
    sections = form_sections(template_text) if is_form else skeleton_sections(template_text)
    # 節が 0 個は要求が無いのではなく骨格を読めなかった状態。必須検査も未知検査も
    # 素通りし、どんな本文でも exit 0 になるので、ここで止める。
    if not sections:
        results["errors"].append(f"unreadable_skeleton:{template.name}")
    required = [name for name, optional in sections if not optional]
    present = body_section_names(body_text)
    for name in FLOOR.get(template_type, ()):
        if name not in present and name not in required:
            required.append(name)
    for name in required:
        if name in present:
            results["checks"].append(f"section:{name}=ok")
        else:
            results["errors"].append(f"missing_section:{name}")

    # リポジトリ側のテンプレートは web UI が埋めさせる最小要件なので、CLI 起票が節を
    # 足すのは逸脱ではない。閉じた集合として扱うのは skill 自身のテンプレートだけ。
    if is_form or not own_template:
        results["checks"].append("unknown_section=skipped (repository template)")
    else:
        known = {name for name, _ in sections} | ALLOWED_EXTRA
        extra = sorted(present - known)
        for name in extra:
            results["errors"].append(f"unknown_section:{name}")
        if not extra:
            results["checks"].append("unknown_section=none")

    print(json.dumps(results, indent=2))
    sys.exit(1 if results["errors"] else 0)


if __name__ == "__main__":
    main()
