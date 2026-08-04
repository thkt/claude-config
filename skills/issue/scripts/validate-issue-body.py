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
# Headings that stay out of errors despite being absent from the skeleton. An issue
# carrying a transferred /think plan always has these two, and Phase 3 of
# skills/issue/SKILL.md is what puts them there.
ALLOWED_EXTRA = frozenset({"Plan", "Backlog candidates"})


def skeleton_sections(template_text):
    """(name, optional) pairs read from the first code block under "## Template".

    Reading up to the next heading is not available here: the skeleton itself is
    markdown full of "## " headings inside the code fence, so that bound stops at the
    first of those instead of at "## Guidelines". The code fence closes itself, so this
    locates the heading start only and looks for the first fence after it.
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
    """(name, optional) pairs read from a GitHub issue form's (.yml) body entries.

    The form turns each label into a heading when someone files through the web UI.
    Taking those same labels as the skeleton for a CLI filing gives both routes the same
    sections. Only an entry whose `validations.required` is true counts as required.

    No YAML parser ships with the standard library. An issue form's body is a flat
    `- type:` sequence with no nesting, so splitting on that separator and reading each
    piece covers it.
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
    sections = form_sections(template_text) if is_form else skeleton_sections(template_text)
    required = [name for name, optional in sections if not optional]
    present = body_section_names(body_text)
    for name in required:
        if name in present:
            results["checks"].append(f"section:{name}=ok")
        else:
            results["errors"].append(f"missing_section:{name}")

    # A .yml lists a web form's minimum, not a closed set of sections. A CLI filing that
    # adds to it is not deviating, so off-skeleton headings are only faulted for .md.
    if is_form:
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
