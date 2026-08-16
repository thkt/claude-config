"""Japanese detection shared by the hooks that treat Japanese prose differently.

Callers pick the threshold: ja-prose-guard asks whether a single character survives,
textlint asks whether the text is Japanese enough for Japanese-only rules to apply.
"""

# A hook can run with PATH cut down to /usr/bin, where python3 is old enough to reject
# `X | None` at import time. Deferred annotations keep this module loadable there.
from __future__ import annotations

import re

# Hiragana, katakana, the long-vowel mark, and CJK ideographs. Punctuation stays out: a
# line holding only 、。 carries no words.
JAPANESE = re.compile(r"[ぁ-んァ-ヶー一-龥]")

# A stray Japanese noun in an English page does not make the page Japanese.
DEFAULT_THRESHOLD = 50


def has_japanese(text: str, threshold: int | None = None) -> bool:
    """None takes the default, so a caller holding an optional threshold passes it as is."""
    return len(JAPANESE.findall(text)) >= (DEFAULT_THRESHOLD if threshold is None else threshold)
