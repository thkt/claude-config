#!/usr/bin/env python3
"""Usage: validate-outcome.py <outcome-file>

stdout: JSON { file, state, flow, errors, warnings, checks }
  state: absent | empty | ok
  flow:  generate | update
exit: 0 if no errors (warnings allowed), 1 if errors
"""

import json
import re
import sys
from pathlib import Path

REQUIRED_SECTIONS = ("Outcome state", "Behavior", "Non-goals", "Constraints")
FILLED_SECTIONS = ("Behavior", "Non-goals", "Constraints")
INDICATORS = ("Time", "Error rate", "Value")
# テンプレートの穴埋めは {...} の形で、行全体か表セル全体を占める。位置を問わず
# brace に一致させると、{status, findings} のような JSON の形を書いた Behavior まで拾う。
PLACEHOLDER_LINE = re.compile(r"^[ \t]*(\{[^{}\n]+\})[ \t]*$", flags=re.MULTILINE)
PLACEHOLDER_CELL = re.compile(r"\|[ \t]*(\{[^{}\n]+\})[ \t]*(?=\|)")


def section_body(text: str, heading: str) -> str | None:
    """`heading` 配下のテキストを、同レベル以上の次の heading まで返す。"""
    match = re.search(rf"^(#{{2,3}}) {re.escape(heading)}\s*$", text, flags=re.MULTILINE)
    if not match:
        return None
    level = len(match.group(1))
    rest = text[match.end() :]
    stop = re.search(rf"^#{{1,{level}}} ", rest, flags=re.MULTILINE)
    return rest[: stop.start()] if stop else rest


def is_unfilled(body: str) -> bool:
    """見出しの下に箇条書き記号と TBD しか無いとき True。"""
    for line in body.splitlines():
        content = re.sub(r"^\s*([-*]|\d+\.)\s*", "", line).strip()
        if not content or content.upper() == "TBD":
            continue
        return False
    return True


def report(target: str, state: str, results: dict[str, list[str]]) -> None:
    """報告を出力して終了する。errors があれば 1、無ければ 0。"""
    print(
        json.dumps(
            {
                "file": target,
                "state": state,
                "flow": "update" if state == "ok" else "generate",
                **results,
            },
            indent=2,
        )
    )
    sys.exit(1 if results["errors"] else 0)


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    target = sys.argv[1]
    path = Path(target)

    results: dict[str, list[str]] = {"errors": [], "warnings": [], "checks": []}
    if not path.is_file():
        results["checks"].append("file=absent")
        report(target, "absent", results)

    text = path.read_text(encoding="utf-8")

    for section in REQUIRED_SECTIONS:
        if section_body(text, section) is None:
            results["errors"].append(f"missing_section:{section}")
        else:
            results["checks"].append(f"section:{section}=ok")

    left = PLACEHOLDER_LINE.findall(text) + PLACEHOLDER_CELL.findall(text)
    if left:
        results["errors"].append(f"placeholder_left:{len(left)} [{left[0]}]")
    else:
        results["checks"].append("placeholder=none")

    unfilled = [s for s in FILLED_SECTIONS if is_unfilled(section_body(text, s) or "")]
    behavior_unfilled = "Behavior" in unfilled
    if behavior_unfilled:
        results["checks"].append("behavior=unfilled")
    if len(unfilled) == len(FILLED_SECTIONS):
        results["checks"].append("all_sections=unfilled")

    indicators = section_body(text, "Indicators")
    if indicators is None:
        results["checks"].append("indicators=omitted")
    else:
        for label in INDICATORS:
            if re.search(rf"^\|\s*{re.escape(label)}\s*\|", indicators, flags=re.MULTILINE):
                results["checks"].append(f"indicator:{label}=ok")
            else:
                results["warnings"].append(f"missing_indicator:{label}")

    report(target, "empty" if behavior_unfilled else "ok", results)


if __name__ == "__main__":
    main()
