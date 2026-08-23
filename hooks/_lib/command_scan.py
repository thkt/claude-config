"""Command-position scanning shared by the PreToolUse hooks.

A hook that decides on a Bash call needs to know which commands the line runs and
what a flag on one of them is set to. Both answers come from where a token sits,
which a regex over the raw string cannot tell: `rm` inside a sed script is not a
deletion, and `gh issue create` inside a commit message is not a filing.
"""

from __future__ import annotations

import re
import shlex
from collections.abc import Iterator, Sequence
from pathlib import Path

# Anything taking a subcommand of its own (git, npm) stays out: there the first token
# already is the command.
WRAPPERS = frozenset({"sudo", "env", "time", "nice", "xargs", "command", "exec", "nohup"})

# A wrapper flag that takes a value swallows the token after it, which would otherwise
# read as the command being wrapped (`sudo -u root rm x` would resolve to root).
VALUED_WRAPPER_FLAGS = frozenset({"-u", "-g", "-p", "-n", "-P", "-I", "-d", "-s", "-a", "-E", "-C"})

# A shell assignment ahead of a command sets the environment for it, the same position `env`
# takes. Left in place it reads as the command name, so `FOO=1 rm -rf x` never matches rm and
# the hook that stops rm passes it through.
ENV_ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")

# git reads everything past this as a path, not as a flag.
PATH_SEPARATOR = "--"

# find runs whatever follows these, so the scan continues past them inside one command.
EXEC_FLAGS = frozenset({"-exec", "-execdir", "-ok", "-okdir"})

SEPARATORS = frozenset({";", "|", "||", "&&", "&", "\n"})

# Not left as whitespace, which shlex would drop and join the lines on either side into
# one command. As punctuation the newline stays a token, while one inside quotes stays
# part of its token, so a multi-line commit message holds together.
_NEWLINE = "\x00"
# A line continuation is escaped onto this instead of onto _NEWLINE. shlex returns the same
# character escaped or not, so as _NEWLINE it reads as the separator and splits the command.
_CONTINUATION = "\x01"
_PUNCTUATION = "();<>|&" + _NEWLINE

_HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1")


def _without_heredocs(text: str) -> str:
    """Drop heredoc bodies. Newlines separate commands, so a body left in place turns each
    of its lines into a command of its own.

    The closing line is found before anything is dropped. Quoting is still unresolved here,
    so `-m 'see << EOF'` reads the same as a real marker; without a closing line it is quoted
    text, and dropping the rest for it would hide the commands after it.
    """
    lines = text.split("\n")
    kept: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        kept.append(line)
        index += 1
        match = _HEREDOC.search(line)
        if not match:
            continue
        closing = match.group(2)
        for end in range(index, len(lines)):
            if lines[end].strip() == closing:
                index = end + 1
                break
    return "\n".join(kept)


def _restore(token: str) -> str:
    """A backslash still ahead of _CONTINUATION means shlex read both as quoted text, where
    the two characters are literal. Outside quotes it consumes the backslash, leaving the
    continuation to drop so the lines it separated join.
    """
    return (
        token.replace("\\" + _CONTINUATION, "\\\n")
        .replace(_CONTINUATION, "")
        .replace(_NEWLINE, "\n")
    )


def _tokens(text: str) -> list[str]:
    prepared = text.replace("\\\n", "\\" + _CONTINUATION).replace("\n", _NEWLINE)
    lexer = shlex.shlex(prepared, posix=True, punctuation_chars=_PUNCTUATION)
    lexer.whitespace_split = True
    # A continuation between two words lexes as its own token, where the shell leaves nothing.
    return [_restore(token) for token in lexer if token != _CONTINUATION]


def commands(text: str) -> Iterator[list[str]]:
    """Yield each command as a token list, its first entry the executable name.

    Raises ValueError on input shlex cannot close, which lets a fail-closed hook
    deny rather than guess.
    """
    for _, tokens in commands_with_env(text):
        yield tokens


def commands_with_env(text: str) -> Iterator[tuple[dict[str, str], list[str]]]:
    """Each command with the assignments that precede it.

    An assignment can change where a command lands (`GIT_DIR=` picks the repository), so a hook
    answering "which target does this reach" cannot read the tokens alone.
    """
    current: list[str] = []
    for token in _tokens(_without_heredocs(text)):
        if token in SEPARATORS:
            if current:
                yield from _resolve(current)
            current = []
            continue
        current.append(token)
    if current:
        yield from _resolve(current)


def _resolve(tokens: list[str]) -> Iterator[tuple[dict[str, str], list[str]]]:
    """Emit the real command a token list runs, plus any it runs through -exec."""
    env: dict[str, str] = {}
    index = 0
    while index < len(tokens):
        if ENV_ASSIGNMENT.match(tokens[index]):
            name, _, value = tokens[index].partition("=")
            env[name] = value
            index += 1
        elif Path(tokens[index]).name in WRAPPERS:
            index += 1
            while index < len(tokens) and tokens[index].startswith("-"):
                index += 2 if tokens[index] in VALUED_WRAPPER_FLAGS else 1
        elif tokens[index] in EXEC_FLAGS:
            # shlex unescapes the `\;` closing a -exec, so the separator split hands the
            # next one over headed by the flag instead of by the command it runs.
            index += 1
        else:
            break
    if index >= len(tokens):
        return
    resolved = [Path(tokens[index]).name, *tokens[index + 1 :]]
    yield env, resolved

    for position, token in enumerate(resolved):
        if token in EXEC_FLAGS and position + 1 < len(resolved):
            yield from _resolve(resolved[position + 1 :])
            return


# git's own options sit before the subcommand, and the valued ones swallow the token after
# them, which would otherwise read as the subcommand (`git -C /tmp clean` resolves to /tmp).
VALUED_GIT_FLAGS = frozenset({"-C", "-c", "--git-dir", "--work-tree", "--namespace"})


# A call in a default is rejected by a strict type checker.
_NO_FLAGS: frozenset[str] = frozenset()


def subcommand(
    tokens: list[str], valued_flags: frozenset[str] = _NO_FLAGS
) -> tuple[str | None, list[str]]:
    """Return the subcommand a call names and the arguments after it.

    Options in valued_flags swallow the token after them. Returns (None, []) when no
    subcommand follows, which is what `git -C /tmp` on its own leaves.
    """
    args = tokens[1:]
    index = 0
    while index < len(args) and args[index].startswith("-"):
        index += 2 if args[index] in valued_flags else 1
    if index >= len(args):
        return None, []
    return args[index], args[index + 1 :]


def git_subcommand(tokens: list[str]) -> tuple[str | None, list[str]]:
    """Return the subcommand a git call names and the arguments after it."""
    return subcommand(tokens, VALUED_GIT_FLAGS)


def flag_value(tokens: list[str], flag: str) -> str | None:
    """Return the value a flag carries, in either `--flag value` or `--flag=value`."""
    prefix = flag + "="
    for position, token in enumerate(tokens):
        if token == flag:
            return tokens[position + 1] if position + 1 < len(tokens) else None
        if token.startswith(prefix):
            return token[len(prefix) :]
    return None


def starts_with(tokens: list[str], prefix: Sequence[str]) -> bool:
    """Whether a command opens with the given token sequence."""
    return tokens[: len(prefix)] == list(prefix)


def before_pathspec(rest: list[str]) -> list[str]:
    """The arguments up to `--`.

    What follows names files, and reading those as flags lets `git rm -- -h` pass as a request
    for help and `git clean -fd -- -notes` pass as a dry run.
    """
    return rest[: rest.index(PATH_SEPARATOR)] if PATH_SEPARATOR in rest else rest


def git_clean_only_lists(rest: list[str]) -> bool:
    """Whether a git clean call prints its targets instead of removing them."""
    for arg in before_pathspec(rest):
        if arg == "--dry-run":
            return True
        # Short flags combine, so the dry-run bit arrives inside -nd as well as alone.
        if arg.startswith("-") and not arg.startswith("--") and "n" in arg:
            return True
    return False
