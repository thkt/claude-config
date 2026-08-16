# Mirror Conventions

Conventions for how `.ja/` and the English files correspond (DR-0073).

## Canonical side and mirroring

Files under `.ja/` are canonical; edit `.ja/` first, then mirror to the English file in the same commit. The mirror target is the path without the `.ja/` prefix. Scope is judged by the path without the `.ja/` prefix too.

The English side is the executable, not the source of intent. Never let a phrasing that exists only for the English side flow back into `.ja/`. Injecting a word into a `.ja/` prompt because the English test asserts on it is a violation. When per-language assertions are needed, split the test per language.

## Mirroring form

Tests live on the English side only and are not carried into `.ja/` (DR-0092). Code under `.ja/` is never executed, so a behavior test there just runs the same logic twice. Mirror drift also takes the form of both sides going stale while staying internally consistent, which running the behavior twice cannot detect.

Japanese is written under `.ja/` alone; prose in every other file is written in English. That covers comments, test names, and assertion messages. Data a test matches against keeps its original language. A test with no `.ja/` counterpart follows this rule too, since what decides it is the path rather than the mirror pairing.

The mirroring form is decided by content, not file type. A file that carries prose (Markdown, and a prompt-embedding script such as `workflows/build.js`) has its prose (comments / prompts / message strings) translated, while code structure, identifiers, stopped values, JSON keys, and schemas stay identical. A script with no prose is an identical copy. Never sync translated files with `cp`. `output-styles/**` is the exception with no mirror; write it in Japanese directly as a single file at the real path. Its directives are bound to the output language (connectives, sentence endings), so an English translation loses the concrete forms.
