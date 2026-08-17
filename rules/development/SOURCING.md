---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.cjs"
  - "**/*.rs"
  - "**/*.py"
  - "**/*.go"
  - "**/*.swift"
---

# Sourcing

When writing framework or library API code, training-data memory can drift from the pinned version. Treat the pinned version's official docs as the authoritative source, write from the docs rather than memory, and leave a citation on non-obvious APIs.

This operationalizes CLAUDE.md's Verify rule "Facts cite source" at framework-code write-time.

## Applies to

Apply when writing code that depends on a framework or library public API.

| Apply                                                                | Do not apply                                 |
| -------------------------------------------------------------------- | -------------------------------------------- |
| External framework / library signature, option name, default value   | Stable APIs of the language standard library |
| Version-dependent behavior (lifecycle, deprecation, breaking change) | Code inside your own project                 |
| API where memory is vague or last confirmed long ago                 | Version-independent, obvious calls           |

## Procedure

Once it applies, run the following before writing from memory.

1. Confirm the pinned version from the lockfile / manifest (package.json, Cargo.toml, etc.) and fetch that version's official docs via `scout fetch <url>`.
2. Write per the docs signature. When memory and docs disagree, the docs win.
3. Leave the source URL in a comment or commit. Limit to load-bearing, non-obvious APIs; annotating obvious ones is excess. Deep-link the URL to the cited API's section / line anchor rather than the docs root.

## When docs are unreachable

When official docs are unreachable (no docs, fetch failure, scout not installed), mark that API usage `unverified` and surface it to the human. Do not write memory as confirmed fact.
