---
paths:
  - ".claude/agents/**"
  - ".claude/docs/**"
  - ".claude/output-styles/**"
  - ".claude/rules/**"
  - ".claude/skills/**"
  - ".claude/workflows/**"
  - ".ja/**"
  - "CLAUDE.md"
  - "README.md"
  - "agents/**"
  - "docs/**"
  - "output-styles/**"
  - "rules/**"
  - "skills/**"
  - "workflows/**"
---

# Mirror Conventions

Conventions for how `.ja/` and the English files correspond (ADR-0073).

## Canonical side and mirroring

Files under `.ja/` are canonical; edit `.ja/` first, then mirror to the English file in the same commit. The mirror target is the path without the `.ja/` prefix. Scope is judged by the path without the `.ja/` prefix too.

The English side is the executable, not the source of intent. Never let a phrasing that exists only for the English side flow back into `.ja/`. Injecting a word into a `.ja/` prompt because the English test asserts on it is a violation. When per-language assertions are needed, split the test per language.

## Mirroring form

The mirroring form is decided by content, not file type. A file that carries prose (Markdown, and a prompt-embedding script such as `workflows/build.js`) has its prose (comments / prompts / message strings) translated, while code structure, identifiers, stopped values, JSON keys, and schemas stay identical. A script with no prose is an identical copy. Never sync translated files with `cp`.
