#!/usr/bin/env python3
"""Usage: validate-outcome.py <outcome-file>

stdout: JSON { file, state, flow, errors, warnings, checks }
  state: absent | empty | ok
  flow:  generate | update  (このファイルが振り分ける /outcome の分岐)
exit: 0 if no errors (warnings allowed), 1 if errors
"""

import json
import re
import sys
from pathlib import Path

REQUIRED_SECTIONS = ("Outcome state", "Behavior", "Non-goals", "Constraints")
FILLED_SECTIONS = ("Behavior", "Non-goals", "Constraints")
INDICATORS = ("Time", "Error rate", "Value")
# テンプレートはプロンプトを {...} として、行全体か表セル全体を占める形で書く。
# 位置を問わず brace に一致させると、{status, findings} のような JSON 形を挙げた
# Behavior まで検出してしまう。
PLACEHOLDER_LINE = re.compile(r"^[ \t]*(\{[^{}\n]+\})[ \t]*$", flags=re.MULTILINE)
PLACEHOLDER_CELL = re.compile(r"\|[ \t]*(\{[^{}\n]+\})[ \t]*(?=\|)")


def section_body(text, heading):
    """`heading` 配下のテキストを、同レベル以上の次の heading まで返す。"""
    match = re.search(rf"^(#{{2,3}}) {re.escape(heading)}\s*$", text, flags=re.MULTILINE)
    if not match:
        return None
    level = len(match.group(1))
    rest = text[match.end() :]
    stop = re.search(rf"^#{{1,{level}}} ", rest, flags=re.MULTILINE)
    return rest[: stop.start()] if stop else rest


def is_unfilled(body):
    """heading 配下に TBD マーカーしか無いとき True。"""
    for line in body.splitlines():
        content = re.sub(r"^\s*([-*]|\d+\.)\s*", "", line).strip()
        if not content or content.upper() == "TBD":
            continue
        return False
    return True


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else ""
    path = Path(target)
    if not target:
        print("Usage: validate-outcome.py <outcome-file>", file=sys.stderr)
        sys.exit(1)
    if not path.is_file():
        print(
            json.dumps(
                {
                    "file": target,
                    "state": "absent",
                    "flow": "generate",
                    "errors": [],
                    "warnings": [],
                    "checks": ["file=absent"],
                },
                indent=2,
            )
        )
        sys.exit(0)

    text = path.read_text(encoding="utf-8")
    results = {"errors": [], "warnings": [], "checks": []}

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

    state = "empty" if behavior_unfilled else "ok"
    print(
        json.dumps(
            {
                "file": target,
                "state": state,
                "flow": "generate" if state == "empty" else "update",
                **results,
            },
            indent=2,
        )
    )
    sys.exit(1 if results["errors"] else 0)


if __name__ == "__main__":
    main()
