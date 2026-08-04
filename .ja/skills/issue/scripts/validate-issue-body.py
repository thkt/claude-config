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
# 骨格に無くても errors にしない節。/think の plan を転記した issue はこの 2 節を必ず持ち、
# skills/issue/SKILL.md の Phase 3 がそれを指示している。緩和はこの 2 つに限り、
# 他の骨格外見出しは unknown_section として残す。
ALLOWED_EXTRA = frozenset({"Plan", "Backlog candidates"})


def skeleton_sections(template_text):
    """"## Template" 配下、最初のコードブロックから読む (name, optional) のペア。

    section_body の stop 境界 ("^#{1,level} " の次の一致) はここでは使えない。
    骨格そのものが "## " 見出しだらけの markdown をコードフェンスの中に持つため、
    その境界だと "## Guidelines" ではなくフェンス内の最初の見出しで止まってしまう。
    コードフェンスは自己完結して閉じるので、ここでは見出しの開始位置だけを特定し、
    その後ろで CODE_BLOCK に最初のフェンスを探させる。
    """
    heading_match = re.search(r"^## Template\s*$", template_text, flags=re.MULTILINE)
    if heading_match is None:
        return []
    code_match = CODE_BLOCK.search(template_text[heading_match.end() :])
    skeleton = code_match.group(1) if code_match else ""
    sections = []
    for name in HEADING.findall(skeleton):
        optional = bool(OPTIONAL_SUFFIX.search(name))
        bare = OPTIONAL_SUFFIX.sub("", name)
        sections.append((bare, optional))
    return sections


def form_sections(form_text):
    """GitHub issue form (.yml) の body 要素から読む (name, optional) のペア。

    フォームは Web UI からの起票で label を見出しに変える。同じ label を CLI 起票の
    骨格にも使えば、どちらの経路で立った issue も同じ節を持つ。`validations.required`
    が真の要素だけを必須とし、説明文だけの markdown 要素は label を持たないので落ちる。

    YAML パーサは標準ライブラリに無い。issue form の body は `- type:` 区切りの平坦な
    並びで入れ子を持たないため、区切りで割ってから各断片を読む。
    """
    body_start = re.search(r"^body:\s*$", form_text, flags=re.MULTILINE)
    if body_start is None:
        return []
    entries = re.split(r"^\s*- type:\s*", form_text[body_start.end() :], flags=re.MULTILINE)[1:]
    sections = []
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


def template_sections(template_path, template_text):
    if template_path.suffix in (".yml", ".yaml"):
        return form_sections(template_text)
    return skeleton_sections(template_text)


def body_section_names(body_text):
    return {OPTIONAL_SUFFIX.sub("", name) for name in HEADING.findall(body_text)}


def main():
    if len(sys.argv) < 4:
        print("Usage: validate-issue-body.py <template-file> <title> <body-file>", file=sys.stderr)
        sys.exit(1)
    template_path, title, body_path = sys.argv[1], sys.argv[2], sys.argv[3]

    template = Path(template_path)
    template_text = template.read_text(encoding="utf-8")
    body_text = Path(body_path).read_text(encoding="utf-8")

    results = {"errors": [], "warnings": [], "checks": []}

    title_match = TYPE_PREFIX.match(title)
    template_type = Path(template_path).stem
    if title_match:
        title_type = title_match.group(1).lower()
        if title_type != template_type:
            results["errors"].append(f"type_mismatch:title={title_type} template={template_type}")
        else:
            results["checks"].append(f"type_match:{title_type}=ok")
    else:
        results["errors"].append("type_mismatch:title has no bracketed type prefix")

    sections = template_sections(template, template_text)
    required = [name for name, optional in sections if not optional]
    present = body_section_names(body_text)
    for name in required:
        if name in present:
            results["checks"].append(f"section:{name}=ok")
        else:
            results["errors"].append(f"missing_section:{name}")

    # .yml は Web UI フォームの最小要件を並べたもので、閉じた節リストではない。CLI 起票が
    # そこへ節を足すのは逸脱でないため、余計な節を咎めるのは .md 骨格のときに限る。
    if template.suffix in (".yml", ".yaml"):
        results["checks"].append("unknown_section=skipped (form template)")
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
