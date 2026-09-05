#!/usr/bin/env python3
"""Usage: validate-issue-body.py <template-file> <title> <body-file>
       validate-issue-body.py --content-only <body-file>

--content-only runs the checks that need no skeleton. The number route edits an issue filed
against a template nobody recorded, so those are all it can run.

stdout: JSON { errors, warnings, checks }
exit: 0 if no errors (warnings allowed), 1 if errors
"""

import json
import re
import sys
from pathlib import Path

TYPE_PREFIX = re.compile(r"^\[([A-Za-z]+)\]")
HEADING = re.compile(r"^## (.+?)\s*$", flags=re.MULTILINE)
CODE_BLOCK = re.compile(r"```[^\n]*\n(.*?)```", flags=re.DOTALL)
OPTIONAL_SUFFIX = re.compile(r"\s*\((?:optional|任意)\)\s*$")
FORM_SUFFIXES = (".yml", ".yaml")
FRONTMATTER = re.compile(r"\A---\n.*?\n---\n", flags=re.DOTALL)
# The list marker and checkbox that open a line. What survives the strip is the content.
MARKER = re.compile(r"^\s*(?:[-*]|\d+\.)?\s*(?:\[[ xX]\])?\s*")
PLACEHOLDER = re.compile(r"\{[^{}\n]+\}")
PLACEHOLDER_ONLY = re.compile(r"^\{[^{}\n]+\}$")
# The floor the skill keeps whatever the skeleton requires. A repository form states the web UI's
# minimum, which is thinner than what a filed issue has to carry: without this a feature issue
# passes with no acceptance criteria and a bug with no reproduction.
FLOOR = {
    "feature": ("Acceptance Criteria", "Testing Decisions"),
    "bug": ("Steps to Reproduce", "Expected vs Actual"),
}
# A repository form names the floor sections in its own language. Each English floor name lists
# the labels that stand for the same section. Without this, a body passes only when it carries
# both the Japanese form's required section and the English floor.
FLOOR_ALIASES = {
    "Steps to Reproduce": ("再現手順",),
    "Expected vs Actual": ("期待 / 実際",),
}
# Plan and Backlog candidates come with a transferred /think plan; Parent and Blocked by come from
# /slice, which wraps every skeleton it picks in the two. Faulting them for being absent from the
# skeleton would fail every body those two routes produce.
ALLOWED_EXTRA = frozenset({"Plan", "Backlog candidates", "Parent", "Blocked by"})


def skeleton_text(template_text: str) -> str:
    """The skeleton itself: the first code fence under "## Template".

    Reading up to the next heading is not available here: the skeleton itself is
    markdown full of "## " headings inside the code fence, so that bound stops at the
    first of those instead of at "## Guidelines". The code fence closes itself, so this
    locates the heading start only and looks for the first fence after it.

    A file without "## Template" is a repository's own .github/ISSUE_TEMPLATE/<type>.md,
    whose body is the skeleton as it stands. Without this branch no section is read and
    every heading in a correct body is faulted as unknown_section.
    """
    heading_match = re.search(r"^## Template\s*$", template_text, flags=re.MULTILINE)
    if heading_match is None:
        return FRONTMATTER.sub("", template_text)
    code_match = CODE_BLOCK.search(template_text[heading_match.end() :])
    return code_match.group(1) if code_match else ""


def skeleton_sections(template_text: str) -> list[tuple[str, bool]]:
    """(name, optional) pairs read from the skeleton."""
    sections: list[tuple[str, bool]] = []
    names: list[str] = HEADING.findall(skeleton_text(template_text))
    for name in names:
        optional = bool(OPTIONAL_SUFFIX.search(name))
        bare = OPTIONAL_SUFFIX.sub("", name)
        sections.append((bare, optional))
    return sections


def form_sections(form_text: str) -> list[tuple[str, bool]]:
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
    """Section names in the body, counting nothing inside a code fence.

    The skeleton is read from inside a fence, but a `## ` fenced in the body is a quotation
    rather than a section. Counting it turns a quotation the skeleton lacks into
    unknown_section and fails a body that was right.
    """
    outside = CODE_BLOCK.sub("", body_text)
    names: list[str] = HEADING.findall(outside)
    return {OPTIONAL_SUFFIX.sub("", name) for name in names}


def section_body(body_text: str, name: str) -> str | None:
    """The lines under `## <name>` in the body, up to the next h2 or the end."""
    outside = CODE_BLOCK.sub("", body_text)
    matches = list(HEADING.finditer(outside))
    for index, match in enumerate(matches):
        if OPTIONAL_SUFFIX.sub("", match.group(1)) != name:
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(outside)
        return outside[match.end() : end]
    return None


def is_unfilled(body: str) -> bool:
    """Whether nothing but list markers, checkboxes, and TBD sits under a heading."""
    for line in body.splitlines():
        content = MARKER.sub("", line).strip()
        if not content or content.upper() == "TBD":
            continue
        return False
    return True


def placeholders_left(body_text: str, skeleton: str) -> list[str]:
    """The template prompts still sitting in the body.

    A line that is nothing but `{...}` once its marker comes off is unwritten wherever it
    came from. Anything else has to match a prompt the skeleton itself carries, so a body
    naming a JSON shape such as {status, findings} is not read as unwritten.
    A fenced block is quoted sample text, so its braces stay out of the count.
    """
    outside = CODE_BLOCK.sub("", body_text)
    left: list[str] = []
    for line in outside.splitlines():
        content = MARKER.sub("", line).strip()
        if PLACEHOLDER_ONLY.match(content):
            left.append(content)
    prompts: list[str] = PLACEHOLDER.findall(skeleton)
    in_body: list[str] = PLACEHOLDER.findall(outside)
    for found in in_body:
        if found in prompts and found not in left:
            left.append(found)
    return left


def record_placeholders(body_text: str, skeleton: str, results: dict[str, list[str]]) -> None:
    """Put the template prompts still left in the body into results."""
    left = placeholders_left(body_text, skeleton)
    if left:
        results["errors"].append(f"placeholder_left:{len(left)} [{left[0]}]")
    else:
        results["checks"].append("placeholder=none")


def report(results: dict[str, list[str]]) -> None:
    """Print the report and exit 1 when it carries an error."""
    print(json.dumps(results, indent=2))
    sys.exit(1 if results["errors"] else 0)


def content_only_report(body_path: str) -> None:
    """The number route's validation: the checks that run without a skeleton."""
    results: dict[str, list[str]] = {"errors": [], "warnings": [], "checks": []}
    record_placeholders(Path(body_path).read_text(encoding="utf-8"), "", results)
    report(results)


def main() -> None:
    # The number route knows no skeleton, so it runs the checks that do not need one.
    if len(sys.argv) > 2 and sys.argv[1] == "--content-only":
        content_only_report(sys.argv[2])
        return
    if len(sys.argv) < 4:
        print(__doc__, file=sys.stderr)
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
    # Zero sections is not an absence of requirements; it is a skeleton that could not be read.
    # Both the required and the unknown checks then pass over anything, so stop here instead.
    if not sections:
        results["errors"].append(f"unreadable_skeleton:{template.name}")
    required = [name for name, optional in sections if not optional]
    present = body_section_names(body_text)
    known = {n.casefold() for n in (*present, *required)}
    for name in FLOOR.get(template_type, ()):
        names = (name, *FLOOR_ALIASES.get(name, ()))
        if not any(n.casefold() in known for n in names):
            required.append(name)
    for name in required:
        if name in present:
            results["checks"].append(f"section:{name}=ok")
        else:
            results["errors"].append(f"missing_section:{name}")

    # A repository template states the web UI's minimum, so a CLI filing that adds sections to
    # it is not deviating. Only the skill's own templates are a closed set.
    if is_form or not own_template:
        results["checks"].append("unknown_section=skipped (repository template)")
    else:
        known = {name for name, _ in sections} | ALLOWED_EXTRA
        extra = sorted(present - known)
        for name in extra:
            results["errors"].append(f"unknown_section:{name}")
        if not extra:
            results["checks"].append("unknown_section=none")

    record_placeholders(body_text, "" if is_form else skeleton_text(template_text), results)

    unfilled = [
        name
        for name in required
        if name in present and is_unfilled(section_body(body_text, name) or "")
    ]
    for name in unfilled:
        results["errors"].append(f"unfilled_section:{name}")
    if not unfilled:
        results["checks"].append("unfilled_section=none")

    report(results)


if __name__ == "__main__":
    main()
