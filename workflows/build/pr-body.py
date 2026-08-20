#!/usr/bin/env python3
"""Usage: pr-body.py   (ship payload JSON on stdin)

Deterministically render the build workflow's draft-PR fact tail from structured
data build.js already holds. The PR body is a fail-closed surface -- it must
always carry the verify result. Heavier assurance (/audit, /polish review) stays
human-invoked. What the tail carries is the boundary of that assurance:
tail_header states that the build holds no deep review. The person reading it is
the one who launched the build, so what they need is the boundary, not the
command to run. The agent writes only the lead "## Summary" (the human
reviewer's entry point) and appends this tail below it.

Format is deliberately terse and markdown-structured: a one-line label naming the
block as auto-generated, the Closes line, then a collapsed <details> whose
<summary> is the status line (HTML <code>, since markdown does not render inside
<summary>).

It folds because the PR body's entry point is the author's "## Summary", and a
machine-written record must not crush it. The three that stay visible while folded
(the auto-generated label, the Closes line, the status line) are there only to
answer whether opening it is needed, so the safety-critical facts and every
non-zero deviation count live in the status line.

The failure log (a nested <details>) and the informational lists (scope
deviations, missing test statements, anomalies) are shown only when
non-empty, so a clean run stays short instead of repeating "None" per section.
Only a run with something to fold gets a <details>; one with nothing to show
keeps the status line alone. A conformance / structure
finding puts its severity + category in an inline-code lead and sends the location
and the quoted source to a continuation line; packed onto one line the severity
buries and the reader cannot tell where the finding ends and its evidence begins.
An anomaly leads with its conclusion and folds its evidence, verbatim command
output, into a nested <details>.
Bold stays reserved for the section labels, which puts a visual step between a
section and the findings under it.

Fail-closed in two directions: an unparseable payload OR one missing a
safety-critical key (tests_pass / gates_pass) exits 1 with nothing on
stdout, rather than a plausible-looking "clean" body -- a missing key must surface
(via the caller's `&&` chain aborting the PR), not default to a reassuring value.

stdin:  JSON {issue, scope_deviations[], untouched_plan_files[],
              missing_tests[], code_anomalies[], tests_pass, gates_pass,
              verify_output, conformance[], structure[]}
stdout: the markdown fact tail, led by a blank line + horizontal rule.
exit 0 on a completed run. exit 1 on a parse error or a missing required key.
"""

import json
import sys
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import NoReturn, cast

REQUIRED_KEYS = ("tests_pass", "gates_pass")

# Only prose labels translate; the GitHub keyword `Closes`, the code-fenced status
# line, and command names like `/issue` stay verbatim so auto-close and copy-paste
# keep working. Kept in code, not agent-provided, so the tail stays deterministic.
LABELS = {
    "english": {
        "tail_header": "_Below is the build workflow's automated verification. It checks the diff against the plan and does not hunt for code defects. It sits off the PR's main thread, so reading it is optional. Open it when a deviation count in the status line is non-zero._",
        "verify_output": "verify output",
        "evidence": "{n} evidence lines",
        "manual_checks": "Manual verification checklist (complete before merge)",
        "scope_deviations": "Files outside the plan's scope",
        "untouched_plan_files": "Planned files never changed",
        "missing_tests": "Planned test statements not found",
        "conformance": "Issue conformance (review independently)",
        "structure": "Structural deviations from the reference module",
        "anomalies": "Anomalies (Red unconfirmed)",
    },
    "japanese": {
        "tail_header": "_下は build workflow の自動検証結果。plan との突合までで、コードの欠陥を探すレビューはしていない。PR の本筋からは外れるので任意だが、status 行の逸脱件数が非ゼロなら見る。_",
        "verify_output": "verify 出力",
        "evidence": "根拠 {n} 件",
        "manual_checks": "実機確認 (merge 前に実施)",
        "scope_deviations": "Plan スコープ外の変更ファイル",
        "untouched_plan_files": "一度も変更されていない plan の files",
        "missing_tests": "テストとして見つからない plan の言明",
        "conformance": "Issue 適合性 (独立レビュー)",
        "structure": "参照モジュールからの構造逸脱",
        "anomalies": "異常 (Red 未確認)",
    },
}


def _mapping(value: object) -> dict[str, object]:
    """The value as a string-keyed mapping, empty for anything that is not one."""
    return cast("dict[str, object]", value) if isinstance(value, dict) else {}


def _default_language() -> str:
    """Any read/parse failure falls back to English so the tail still renders."""
    try:
        with (Path.home() / ".claude" / "settings.json").open() as f:
            settings = _mapping(cast("object", json.load(f)))
    except (OSError, json.JSONDecodeError):
        return "english"
    language = settings.get("language")
    return language if isinstance(language, str) and language else "english"


def fail(message: str) -> NoReturn:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def _tag(f: dict[str, object]) -> str:
    """With a severity present, high and trivial findings separate at a glance."""
    severity = f.get("severity")
    category = f.get("category", "?")
    return f"[{severity}] {category}" if severity else f"[{category}]"


def _evidence(location: object, label: str, value: object) -> str:
    """Always opens with a backtick or a word, so an indented continuation line cannot
    become a heading. label comes from the spec_line / reference field names, so it is
    an identifier and stays English rather than joining LABELS."""
    parts: list[str] = []
    if location:
        parts.append(f"`{location}`")
    if value:
        parts.append(f"{label}: {value}")
    return " · ".join(parts)


def _list(items: object) -> list[object]:
    return cast("list[object]", items) if isinstance(items, list) else []


def _fence(text: str) -> str:
    """A code block must not terminate early on content that itself contains ```."""
    longest = current = 0
    for ch in text:
        current = current + 1 if ch == "`" else 0
        longest = max(longest, current)
    return "`" * max(3, longest + 1)


def _finding(f: object, label: str, source_key: str) -> list[str]:
    """A non-mapping raises, which routes it to section's degrade path as a raw string."""
    if not isinstance(f, dict):
        raise TypeError("finding is not a mapping")
    d = cast("dict[str, object]", f)
    return [
        f"`{_tag(d)}` {d.get('detail', '')}".rstrip(),
        _evidence(d.get("location"), label, d.get(source_key)),
    ]


def _anomaly(a: object) -> list[str]:
    """A non-mapping raises, which routes it to section's degrade path as a raw string."""
    if not isinstance(a, dict):
        raise TypeError("anomaly is not a mapping")
    d = cast("dict[str, object]", a)
    return [
        f"{d.get('unit', '?')} ({d.get('kind', '?')}): {d.get('notes', '')}".rstrip(),
        *(str(e) for e in _list(d.get("evidence"))),
    ]


def render(payload: Mapping[str, object]) -> str:
    issue = str(payload.get("issue", "")).strip()
    tests = "pass" if payload.get("tests_pass") else "FAIL"
    gates = "pass" if payload.get("gates_pass") else "FAIL"
    scope = _list(payload.get("scope_deviations"))
    untouched = _list(payload.get("untouched_plan_files"))
    missing = _list(payload.get("missing_tests"))
    conformance = _list(payload.get("conformance"))
    structure = _list(payload.get("structure"))
    raw_lang = payload.get("language")
    lang = raw_lang.lower() if isinstance(raw_lang, str) and raw_lang else "english"
    L = LABELS.get(lang, LABELS["english"])

    out = [L["tail_header"], f"Closes #{issue}" if issue else "Closes #"]

    # The status line itself is the <summary>, so pass/FAIL stays visible while
    # collapsed; markdown does not render inside <summary>, hence <code> instead of
    # backticks.
    summary = (
        f"<code>verify tests={tests} gates={gates}</code> · "
        f"<code>scope-deviations {len(scope)}</code> · "
        f"<code>missing-tests {len(missing)}</code>"
    )
    # A count absent from the summary goes unnoticed inside the fold, so every non-zero
    # count the open-or-not decision rests on surfaces here. The high breakdown is there
    # because a bare count makes a wording nit and a defeated acceptance criterion look alike.
    if untouched:
        summary += f" · <code>untouched-plan-files {len(untouched)}</code>"
    if conformance:
        high = sum(1 for f in conformance if _mapping(f).get("severity") == "high")
        summary += f" · <code>conformance {len(conformance)}"
        summary += f" ({high} high)</code>" if high else "</code>"
    if structure:
        summary += f" · <code>structure {len(structure)}</code>"
    folded: list[str] = []

    if tests == "FAIL" or gates == "FAIL":
        detail = payload.get("verify_output")
        if detail:
            body = detail if isinstance(detail, str) else json.dumps(detail, indent=2)
            fence = _fence(body)
            folded.append(
                f"<details><summary>{L['verify_output']}</summary>\n\n{fence}\n{body}\n{fence}\n\n</details>"
            )

    def section(
        label: str,
        items: object,
        render_item: Callable[[object], str | list[str]],
        fold: str | None = None,
    ) -> None:
        items = _list(items)
        if not items:
            return
        lines: list[str] = []
        for x in items:
            try:
                text = render_item(x)
            except (AttributeError, TypeError, KeyError):
                # A malformed (e.g. non-dict) item must not crash the render and drop
                # the whole fail-closed tail.
                text = str(x)
            # Keep each element on one line: an embedded newline breaks the list and
            # promotes a following line to a heading.
            parts = text if isinstance(text, list) else [text]
            parts = [" ".join(str(p).split("\n")) for p in parts if str(p).strip()]
            if not parts:
                continue
            lines.append("- " + parts[0])
            if fold and len(parts) > 1:
                # Indent 2 keeps these inside the list item; the blank lines around
                # <details> are what let GitHub render the markdown inside it.
                lines.append(f"  <details><summary>{fold.format(n=len(parts) - 1)}</summary>")
                lines.append("")
                lines.extend("  - " + p for p in parts[1:])
                lines.append("")
                lines.append("  </details>")
            else:
                lines.extend("  " + p for p in parts[1:])
        folded.append(f"**{label}**\n" + "\n".join(lines))

    # Rendered as task-list items so the reviewer can tick them off on the PR.
    section(L["manual_checks"], payload.get("manual_checks"), lambda s: f"[ ] {s}")
    section(L["scope_deviations"], scope, lambda f: f"`{f}`")
    # The inverse of scope_deviations: a file the plan named but nothing touched can be
    # the trace of a unit that went unimplemented and still passed.
    section(L["untouched_plan_files"], untouched, lambda f: f"`{f}`")
    section(L["missing_tests"], missing, str)
    section(L["conformance"], conformance, lambda f: _finding(f, "spec", "spec_line"))
    section(L["structure"], structure, lambda f: _finding(f, "ref", "reference"))
    # The evidence is verbatim command output whose line count buries the conclusion, and
    # being verbatim is what makes it evidence, so the renderer is the only place to shorten it.
    section(L["anomalies"], payload.get("code_anomalies"), _anomaly, fold=L["evidence"])

    # Blank lines around the folded content keep GitHub rendering the markdown inside the
    # HTML <details> block. An empty <details> asks the reviewer to open nothing.
    out.append(
        f"<details>\n<summary>{summary}</summary>\n\n" + "\n\n".join(folded) + "\n\n</details>"
        if folded
        else summary
    )

    # The blank line + rule keeps this machine tail separated when appended (>>) below
    # the agent's Summary, and stops the summary's last line becoming a setext heading.
    return "\n\n---\n\n" + "\n\n".join(out) + "\n"


def main() -> None:
    try:
        loaded = cast("object", json.loads(sys.stdin.read()))
    except json.JSONDecodeError as exc:
        fail(f"ship payload is not valid JSON: {exc}")
    if not isinstance(loaded, dict):
        fail("ship payload must be a JSON object")
    payload = cast("dict[str, object]", loaded)
    missing = [k for k in REQUIRED_KEYS if k not in payload]
    if missing:
        fail(f"ship payload missing required key(s): {', '.join(missing)}")
    _ = payload.setdefault("language", _default_language())
    _ = sys.stdout.write(render(payload))


if __name__ == "__main__":
    main()
