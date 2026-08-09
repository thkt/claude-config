"""Command-position scanning shared by the PreToolUse hooks.

A hook that decides on a Bash call needs to know which commands the line runs and
what a flag on one of them is set to. Both answers come from where a token sits,
which a regex over the raw string cannot tell: `rm` inside a sed script is not a
deletion, and `gh issue create` inside a commit message is not a filing.
"""

import os
import re
import shlex

# A wrapper hands execution to the command that follows it, so the caller wants that
# one rather than the wrapper. Anything taking a subcommand of its own (git, npm) is
# deliberately absent: there the first token is the command.
WRAPPERS = frozenset({"sudo", "env", "time", "nice", "xargs", "command", "exec", "nohup"})

# A wrapper flag that takes a value swallows the token after it, which would otherwise
# read as the command being wrapped (`sudo -u root rm x` would resolve to root).
VALUED_WRAPPER_FLAGS = frozenset({"-u", "-g", "-p", "-n", "-P", "-I", "-d", "-s", "-a", "-E", "-C"})

# find runs whatever follows these, so the scan continues past them inside one command.
EXEC_FLAGS = frozenset({"-exec", "-execdir", "-ok", "-okdir"})

SEPARATORS = frozenset({";", "|", "||", "&&", "&"})

_HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1")


def _without_heredocs(text):
    """Drop heredoc bodies, keeping the lines that are commands.

    Newlines separate commands, so a heredoc body left in place turns each of its
    lines into one. That is how a commit message written through `<< 'EOF'` came to
    be read as a filing.
    """
    kept, closing = [], None
    for line in text.split("\n"):
        if closing is not None:
            if line.strip() == closing:
                closing = None
            continue
        kept.append(line)
        match = _HEREDOC.search(line)
        if match:
            closing = match.group(2)
    return "\n".join(kept)


def _tokens(line):
    lexer = shlex.shlex(line, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    return list(lexer)


def commands(text):
    """Yield each command as a token list, its first entry the executable name.

    Raises ValueError on input shlex cannot close, which lets a fail-closed hook
    deny rather than guess.
    """
    for line in _without_heredocs(text).split("\n"):
        if not line.strip():
            continue
        current = []
        for token in _tokens(line):
            if token in SEPARATORS:
                if current:
                    yield from _resolve(current)
                current = []
                continue
            current.append(token)
        if current:
            yield from _resolve(current)


def _resolve(tokens):
    """Emit the real command a token list runs, plus any it runs through -exec."""
    index = 0
    while index < len(tokens) and os.path.basename(tokens[index]) in WRAPPERS:
        index += 1
        while index < len(tokens) and tokens[index].startswith("-"):
            index += 2 if tokens[index] in VALUED_WRAPPER_FLAGS else 1
    if index >= len(tokens):
        return
    resolved = [os.path.basename(tokens[index])] + tokens[index + 1 :]
    yield resolved

    for position, token in enumerate(resolved):
        if token in EXEC_FLAGS and position + 1 < len(resolved):
            yield from _resolve(resolved[position + 1 :])
            return


def flag_value(tokens, flag):
    """Return the value a flag carries, in either `--flag value` or `--flag=value`."""
    prefix = flag + "="
    for position, token in enumerate(tokens):
        if token == flag:
            return tokens[position + 1] if position + 1 < len(tokens) else None
        if token.startswith(prefix):
            return token[len(prefix) :]
    return None


def starts_with(tokens, prefix):
    """Whether a command opens with the given token sequence."""
    return len(tokens) >= len(prefix) and tokens[: len(prefix)] == list(prefix)
