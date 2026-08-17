#!/usr/bin/env python3
"""PreToolUse hook: match a gh issue create body against the skeleton its title's type points
at, and stop the filing when the two diverge.

Every state that leaves the body uncompared denies the filing alongside a body the validator
rejects, since skipping the comparison is the same escape this hook exists to close. Each
reason names the way out of the state it stops.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this file loadable there.
from __future__ import annotations

import sys
from pathlib import Path
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_lib"))

from hook_payload import deny, field, parse

ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = ROOT / "skills" / "issue" / "scripts" / "validate-issue-body.py"
TEMPLATES = ROOT / "skills" / "issue" / "templates"


def _issue_type(title: str) -> str | None:
    """The lowercased type prefix, or None when the title does not open with one."""
    if not title.startswith("[") or "]" not in title:
        return None
    name = title[1 : title.index("]")]
    return name.lower() if name.isalpha() else None


def _template(issue_type: str, repo_dir: Path) -> Path | None:
    """The repository's own template wins: that is what the web UI files against, and a CLI
    filing that ignores it would leave two shapes of the same issue type in one tracker."""
    forms = repo_dir / ".github" / "ISSUE_TEMPLATE"
    for candidate in (
        forms / f"{issue_type}.yml",
        forms / f"{issue_type}.yaml",
        forms / f"{issue_type}.md",
        TEMPLATES / f"{issue_type}.md",
    ):
        if candidate.is_file():
            return candidate
    return None


def _errors(template: Path, title: str, body_file: Path) -> list[str] | None:
    """The validator's findings, or None when it did not report any. It exits 1 both for a
    rejected body and for its own crash, so the JSON on stdout is what separates them.
    stderr stays unredirected so a traceback reaches the debug log."""
    import subprocess

    result = subprocess.run(
        [sys.executable, str(VALIDATOR), str(template), title, str(body_file)],
        stdout=subprocess.PIPE,
        text=True,
        check=False,
    )
    reported = parse(result.stdout).get("errors")
    if not isinstance(reported, list):
        return None
    return [str(entry) for entry in cast("list[object]", reported)]


def main() -> None:
    raw = sys.stdin.read()
    # Cheaper than a parse on a hook that fires for every Bash call. The scan below decides
    # whether this really is a filing; this only keeps the work off everything else.
    if not all(word in raw for word in ('"tool_name":"Bash"', "gh", "issue", "create")):
        return

    command = field(parse(raw).get("tool_input"), "command")
    if not isinstance(command, str) or not command:
        return

    import gh_filing

    try:
        filing = gh_filing.find(command, kind="issue")
    except ValueError:
        deny("issue-body-template: 引用符が閉じておらずコマンドを分割できず、どの断片が起票かを決められない。引用符を閉じて再試行する")
        return
    if filing is None:
        return

    title = gh_filing.flag(filing, gh_filing.TITLE_FLAGS)
    issue_type = _issue_type(title) if title else None
    if title is None or issue_type is None:
        deny("issue-body-template: タイトルに型プレフィックス ([Bug] 等) が無く、どの骨格と照合するかを決められない。タイトルを型で始める")
        return

    path = gh_filing.body_file(filing)
    if path is None:
        deny("issue-body-template: 本文が --body のインライン指定で骨格と照合できない。本文を一時ファイルへ書き --body-file にリテラルの絶対パスで渡す")
        return

    # A hook carries none of the shell state the command will run under, so a path written as
    # `"$B"` or `$TMPDIR/body.md` arrives unexpanded and names nothing on disk.
    if not path.is_file():
        deny(f"issue-body-template: --body-file の指す先 ({path}) が読めず本文を照合できない。パスを変数でなくリテラルの絶対パスで書く")
        return

    template = _template(issue_type, filing.directory)
    if template is None:
        known = ", ".join(sorted(p.stem for p in TEMPLATES.glob("*.md")))
        choices = f"型を {known} のいずれかにするか、" if known else ""
        deny(f"issue-body-template: 型 [{issue_type}] に対応する骨格が .github/ISSUE_TEMPLATE/ にも skills/issue/templates/ にも無く本文を照合できない。{choices}skills/issue/templates/{issue_type}.md を足す")
        return

    errors = _errors(template, title, path)
    if errors is None:
        deny(f"issue-body-template: validator ({VALIDATOR}) が errors 配列を返さず本文を照合できない。python3 で直接実行して出力を確かめる")
        return
    if errors:
        deny(f"issue-body-template: 本文の節構成が骨格と食い違う ({'; '.join(errors)})")


if __name__ == "__main__":
    main()
