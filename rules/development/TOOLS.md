# Tool Preferences

CLI tool > built-in equivalent. WebFetch and WebSearch are hook-routed to the CLI its URL pattern matches.

## Code search

The two skills carry the parsers and the two Bash tools carry the text. Reaching for `ugrep` on a question about shape returns lines that read alike and miss the ones written differently, and reaching for `use-cli-ast-grep` on a string search parses files to find what a literal match already had.

| Task                                            | Use                       | When                                        |
| ----------------------------------------------- | ------------------------- | ------------------------------------------- |
| Match or rewrite by AST shape, syntax-tree unit | `use-cli-ast-grep` skill  | A language ast-grep parses                  |
| Callers, callees, change impact for a symbol    | `use-cli-codegraph` skill | A language codegraph indexes                |
| Literal string or regex content search          | `ugrep` (Bash)            | Any language, and any file the parsers miss |
| File or directory lookup by name                | `bfs` (Bash)              | Any tree                                    |
| Past session search                             | `use-cli-recall` skill    | Any language                                |

## Parallel execution

On first contact with a module or when starting a BACKLOG task, run `use-cli-codegraph` and `use-cli-recall` in parallel. See each skill for details.

## Why this file has no frontmatter

A `rules/` file declares its target file glob in `paths:` frontmatter and loads only when editing a matching file (see rules/conventions/SKILLS.md and others). This file governs a decision made before a search starts, which search tool to reach for, and at that point the file being searched is not yet known. No glob can narrow that decision, so this file carries no `paths:` frontmatter. It follows the same frontmatter-less shape as `rules/conventions/PROSE.md`.
