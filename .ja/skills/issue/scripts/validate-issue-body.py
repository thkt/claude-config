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


def body_section_names(body_text):
    return {OPTIONAL_SUFFIX.sub("", name) for name in HEADING.findall(body_text)}


def main():
    if len(sys.argv) < 4:
        print("Usage: validate-issue-body.py <template-file> <title> <body-file>", file=sys.stderr)
        sys.exit(1)
    template_path, title, body_path = sys.argv[1], sys.argv[2], sys.argv[3]

    template_text = Path(template_path).read_text(encoding="utf-8")
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

    required = [name for name, optional in skeleton_sections(template_text) if not optional]
    present = body_section_names(body_text)
    for name in required:
        if name in present:
            results["checks"].append(f"section:{name}=ok")
        else:
            results["errors"].append(f"missing_section:{name}")

    print(json.dumps(results, indent=2))
    sys.exit(1 if results["errors"] else 0)


if __name__ == "__main__":
    main()
