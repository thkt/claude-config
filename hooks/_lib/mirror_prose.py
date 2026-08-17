"""Detect a .ja/ file whose prose holds no Japanese.

Agents default to writing in English, so a full-file Write silently replaces the Japanese
prose and a diff review does not catch it. textlint does not cover this: it reads only the
Japanese it already finds rather than asking whether a file should hold any.

The edit-time hook and the repository-wide sweep test both import this. The hook answers
for one file as it changes; the sweep answers for every file, including what landed while
no hook was watching.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from hook_payload import edited_file
from japanese import has_japanese

# Extensions whose prose the mirror convention translates.
TARGET_SUFFIXES = (".py", ".js", ".ts", ".sh", ".md")

# A name declaring the file is English. Such a file holds wording a skill quotes verbatim,
# so there is nothing in it to translate.
ENGLISH_SUFFIX = ".en.md"

COMMENT_LINE = re.compile(r"^\s*(#|//|\*)")
SHEBANG_OR_ENCODING = re.compile(r"^#!|^# -\*- coding")


def is_target(path: str) -> bool:
    """A .ja/ directory has to be on the path, not merely the string somewhere in a name."""
    if path.endswith(ENGLISH_SUFFIX):
        return False
    p = Path(path)
    return ".ja" in p.parts and p.suffix in TARGET_SUFFIXES


def _python_prose(src: str) -> list[str]:
    """A regex cannot tell `# heading` inside a triple-quoted template from a real comment.

    ast and tokenize are imported here rather than at module level: every other extension
    reaches this module without needing either, and they are the slowest imports it makes."""
    import ast
    import io
    import tokenize

    out: list[str] = []
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return []
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            doc = ast.get_docstring(node)
            if doc:
                # Split rather than append: the caller counts lines, and a docstring kept
                # whole would report a paragraph as one.
                out.extend(doc.splitlines())
    try:
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            if tok.type == tokenize.COMMENT and not tok.string.startswith("#!"):
                out.append(tok.string)
    except (tokenize.TokenError, IndentationError):
        pass
    return out


def _markdown_prose(src: str) -> list[str]:
    """Markdown carries no comment marker: the body is the prose. Fenced blocks come out,
    where identifiers make up the text."""
    out: list[str] = []
    fenced = False
    for line in src.splitlines():
        if line.startswith("```"):
            fenced = not fenced
            continue
        if not fenced:
            out.append(line)
    return out


def _comment_prose(src: str) -> list[str]:
    return [
        line
        for line in src.splitlines()
        if COMMENT_LINE.match(line) and not SHEBANG_OR_ENCODING.match(line)
    ]


def extract_prose(path: str) -> list[str]:
    """Prose only, never code or string literals. Counting the whole file would pass on any
    file holding a Japanese string literal."""
    target = Path(path)
    src = target.read_text(encoding="utf-8", errors="replace")
    if target.suffix == ".py":
        return _python_prose(src)
    if target.suffix == ".md":
        return _markdown_prose(src)
    return _comment_prose(src)


def check(path: str) -> str | None:
    """The warning for a file that lost its Japanese, or None when there is nothing to say.

    The file has to exist: extract_prose reads it.
    """
    if not is_target(path):
        return None
    lines = extract_prose(path)
    text = "\n".join(lines)
    # A single Japanese character clears this guard, and no prose at all passes: the target
    # is a wholesale replacement, not partial drift or a pure-code identical copy.
    if not text.strip() or has_japanese(text, threshold=1):
        return None
    count = sum(1 for line in lines if line.strip())
    label = "本文" if Path(path).suffix == ".md" else "コメント / docstring"
    return (
        f"mirror_prose_guard: .ja/ は canonical で prose は日本語 (MIRROR.md)。"
        f"{path} の{label} {count} 行に日本語が 1 文字もない。"
        f"英語で書き直していないか確認する。"
        f'過去訳は git log --oneline -- "{path}" から取れる。'
    )


def emit(stdin_text: str) -> None:
    """Answer a PostToolUse payload on stdout. Stderr from a hook that exits 0 reaches no
    one, so a warning written there cannot stop the regression. systemMessage reaches the
    human and additionalContext reaches whoever rewrote the file."""
    path = edited_file(stdin_text)
    if path is None or not Path(path).is_file():
        return
    message = check(path)
    if not message:
        return
    print(
        json.dumps(
            {
                "systemMessage": message,
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": message,
                },
            },
            ensure_ascii=False,
        )
    )
