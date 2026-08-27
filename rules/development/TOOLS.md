# Tool Preferences

CLI tool > built-in equivalent. WebFetch/WebSearch are hook-routed to the corresponding CLI based on URL pattern.

## Code search

| Task                              | Use                    | When                          |
| --------------------------------- | ---------------------- | ----------------------------- |
| Concept / identifier / related code | `use-cli-yomu` skill   | TS/JSX/CSS/HTML/Rust/Markdown |
| Concept / related code            | `ugrep` / `bfs` (Bash) | Swift / Python / Go / others  |
| Literal regex / known exact path | `ugrep` / `bfs` (Bash) | Any language                  |
| Past session search               | `use-cli-recall` skill | Any language                  |

## Parallel execution

On first contact with a module or when starting a BACKLOG task, run `use-cli-yomu` and `use-cli-recall` in parallel. See each skill for details.

## Why this file has no frontmatter

A rules/ file declares its target file glob in `paths:` frontmatter and loads only when editing a matching file (see rules/conventions/SKILLS.md and others). This file governs a decision made before a search starts, which search tool to reach for, and at that point the file being searched is not yet known. No glob can narrow that decision, so this file carries no `paths:` frontmatter. It follows the same frontmatter-less shape as `rules/conventions/PROSE.md`.
