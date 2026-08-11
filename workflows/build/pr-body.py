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

The failure log (a nested <details>) and the informational lists (assumptions,
scope deviations, missing test statements, anomalies) are shown only when
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

stdin:  JSON {issue, assumptions[], scope_deviations[], untouched_plan_files[],
              missing_tests[], code_anomalies[], tests_pass, gates_pass,
              verify_output, conformance[], structure[]}
stdout: the markdown fact tail, led by a blank line + horizontal rule.
exit 0 on a completed run. exit 1 on a parse error or a missing required key.
"""

import json
import sys
from pathlib import Path

REQUIRED_KEYS = ("tests_pass", "gates_pass")

# Human-facing labels by body language. Only prose labels translate; the GitHub
# keyword `Closes`, the code-fenced status line, and command names like `/issue`
# stay verbatim so auto-close and copy-paste keep working. Unknown languages fall
# back to English. Kept in code (not agent-provided) so the tail stays deterministic.
LABELS = {
    "english": {
        "tail_header": "_Below is the build workflow's automated verification. It checks the diff against the plan and does not hunt for code defects. It sits off the PR's main thread, so reading it is optional. Open it when a deviation count in the status line is non-zero._",
        "verify_output": "verify output",
        "evidence": "{n} evidence lines",
        "manual_checks": "Manual verification checklist (complete before merge)",
        "assumptions": "Assumptions (veto targets)",
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
        "assumptions": "前提 (veto 対象)",
        "scope_deviations": "Plan スコープ外の変更ファイル",
        "untouched_plan_files": "一度も変更されていない plan の files",
        "missing_tests": "テストとして見つからない plan の言明",
        "conformance": "Issue 適合性 (独立レビュー)",
        "structure": "参照モジュールからの構造逸脱",
        "anomalies": "異常 (Red 未確認)",
    },
}


def _default_language():
    """The user's PR-body language from the dotclaude settings. Best-effort: any
    read/parse failure falls back to English so the tail still renders."""
    try:
        with open(Path.home() / ".claude" / "settings.json") as f:
            return json.load(f).get("language") or "english"
    except (OSError, json.JSONDecodeError):
        return "english"


def fail(message):
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def _tag(f):
    """A finding's lead. With a severity present, high and trivial findings separate
    at a glance."""
    severity = f.get("severity")
    category = f.get("category", "?")
    return f"[{severity}] {category}" if severity else f"[{category}]"


def _evidence(location, label, value):
    """The continuation line pointing at a finding's evidence. It always opens with a
    backtick or a word, so an indented continuation line cannot become a heading.
    Empty when neither part is present. label comes from the spec_line / reference
    field names, so it is an identifier and stays English rather than joining LABELS."""
    parts = []
    if location:
        parts.append(f"`{location}`")
    if value:
        parts.append(f"{label}: {value}")
    return " · ".join(parts)


def _list(items):
    return items if isinstance(items, list) else []


def _fence(text):
    """A backtick fence at least one longer than the longest backtick run in text,
    so a code block never terminates early on content that itself contains ```."""
    longest = current = 0
    for ch in text:
        current = current + 1 if ch == "`" else 0
        longest = max(longest, current)
    return "`" * max(3, longest + 1)


def render(payload):
    issue = str(payload.get("issue", "")).strip()
    tests = "pass" if payload.get("tests_pass") else "FAIL"
    gates = "pass" if payload.get("gates_pass") else "FAIL"
    scope = _list(payload.get("scope_deviations"))
    untouched = _list(payload.get("untouched_plan_files"))
    missing = _list(payload.get("missing_tests"))
    conformance = _list(payload.get("conformance"))
    structure = _list(payload.get("structure"))
    lang = (payload.get("language") or "english").lower()
    L = LABELS.get(lang, LABELS["english"])

    out = [L["tail_header"], f"Closes #{issue}" if issue else "Closes #"]

    # Everything below the status line folds into one <details> (reviewer request:
    # the tail should not dominate the PR body). The status line itself is the
    # <summary>, so pass/FAIL stays visible while collapsed; markdown does not
    # render inside <summary>, hence <code> instead of backticks.
    summary = (
        f"<code>verify tests={tests} gates={gates}</code> · "
        f"<code>scope-deviations {len(scope)}</code> · "
        f"<code>missing-tests {len(missing)}</code>"
    )
    # The summary is all that shows while the tail is folded, so every non-zero count
    # the open-or-not decision rests on surfaces here; a count absent from the summary
    # goes unnoticed inside the fold. The high breakdown is there because a bare count
    # makes a wording nit and a gap that defeats an acceptance criterion look like the
    # same single finding.
    if untouched:
        summary += f" · <code>untouched-plan-files {len(untouched)}</code>"
    if conformance:
        high = sum(1 for f in conformance if isinstance(f, dict) and f.get("severity") == "high")
        summary += f" · <code>conformance {len(conformance)}"
        summary += f" ({high} high)</code>" if high else "</code>"
    if structure:
        summary += f" · <code>structure {len(structure)}</code>"
    folded = []

    if tests == "FAIL" or gates == "FAIL":
        detail = payload.get("verify_output")
        if detail:
            body = detail if isinstance(detail, str) else json.dumps(detail, indent=2)
            fence = _fence(body)
            folded.append(
                f"<details><summary>{L['verify_output']}</summary>\n\n{fence}\n{body}\n{fence}\n\n</details>"
            )

    def section(label, items, render_item, fold=None):
        items = _list(items)
        if not items:
            return
        lines = []
        for x in items:
            try:
                text = render_item(x)
            except (AttributeError, TypeError, KeyError):
                # A malformed (e.g. non-dict) item must not crash the render and drop
                # the whole fail-closed tail; degrade to its raw string instead.
                text = str(x)
            # A render_item returning a list turns everything past the first element
            # into a continuation line. Keep each element on one line so an embedded
            # newline can't break the list or promote a following line to a heading.
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
    section(L["assumptions"], payload.get("assumptions"), str)
    section(L["scope_deviations"], scope, lambda f: f"`{f}`")
    # The inverse of scope_deviations: a file the plan named but nothing touched can be
    # the trace of a unit that went unimplemented and still passed.
    section(L["untouched_plan_files"], untouched, lambda f: f"`{f}`")
    section(L["missing_tests"], missing, str)
    section(
        L["conformance"],
        conformance,
        lambda f: [
            f"`{_tag(f)}` {f.get('detail', '')}".rstrip(),
            _evidence(f.get("location"), "spec", f.get("spec_line")),
        ],
    )
    section(
        L["structure"],
        structure,
        lambda f: [
            f"`{_tag(f)}` {f.get('detail', '')}".rstrip(),
            _evidence(f.get("location"), "ref", f.get("reference")),
        ],
    )
    # The evidence is verbatim command output whose line count buries the conclusion.
    # Being verbatim is what makes it evidence, so translation cannot shrink it and the
    # renderer is the only place it can be shortened.
    section(
        L["anomalies"],
        payload.get("code_anomalies"),
        lambda a: [
            f"{a.get('unit', '?')} ({a.get('kind', '?')}): {a.get('notes', '')}".rstrip(),
            *(str(e) for e in _list(a.get("evidence"))),
        ],
        fold=L["evidence"],
    )

    # Blank lines around the folded content keep GitHub rendering the markdown
    # inside the HTML <details> block. Only a run with something to fold gets a
    # <details>; an empty one asks the reviewer to open something with nothing in it.
    out.append(
        f"<details>\n<summary>{summary}</summary>\n\n" + "\n\n".join(folded) + "\n\n</details>"
        if folded
        else summary
    )

    # Lead with a blank line + rule so this machine tail stays separated when appended
    # (>>) below the agent's Summary, without turning the summary's last line into a
    # setext heading, and to signal where the auto-generated section begins.
    return "\n\n---\n\n" + "\n\n".join(out) + "\n"


def main():
    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        fail(f"ship payload is not valid JSON: {exc}")
    if not isinstance(payload, dict):
        fail("ship payload must be a JSON object")
    missing = [k for k in REQUIRED_KEYS if k not in payload]
    if missing:
        fail(f"ship payload missing required key(s): {', '.join(missing)}")
    payload.setdefault("language", _default_language())
    sys.stdout.write(render(payload))


if __name__ == "__main__":
    main()
