---
name: use-cli-ast-grep
description: Structural search and rewrite by AST pattern via ast-grep CLI.
when_to_use: AST pattern, structural search, structural rewrite, syntax-aware search, pattern-based refactor across files, code shape match, 構造検索, 構文パターン, 一括書き換え, AST 書き換え
allowed-tools: Bash(ast-grep:*) Read
user-invocable: false
---

# use-cli-ast-grep

## When to use

Structural queries and rewrites only. Route a match by AST shape to ast-grep, and keep text or regex matching on ugrep and bfs, and symbol-level call graphs on codegraph.

| Question                                                    | Tool        |
| ----------------------------------------------------------- | ----------- |
| Structural match / rewrite by AST pattern, syntax-tree unit | ast-grep    |
| Free-text, literal string, or regex search                  | ugrep / bfs |
| Symbol-level callers / callees, change impact               | codegraph   |
| Reading or editing one already-known location               | Read / Edit |

## Commands

`run` is a one-off search or rewrite, `scan` applies a rule file at scale, and `outline` extracts a symbol listing.

| Purpose                                    | Command                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| Pattern search                             | `ast-grep run -p '<pattern>' -l <lang> <PATHS>`               |
| Pattern rewrite (with interactive confirm) | `ast-grep run -p '<pattern>' -r '<fix>' -l <lang> -i <PATHS>` |
| Pattern rewrite (apply all, no confirm)    | `ast-grep run -p '<pattern>' -r '<fix>' -l <lang> -U <PATHS>` |
| Rule-file scan / rewrite                   | `ast-grep scan -r <rule.yml> <PATHS>`                         |
| Symbol listing (structure overview)        | `ast-grep outline -l <lang> <PATHS>`                          |
| JSON output                                | `ast-grep run -p '<pattern>' --json <PATHS>`                  |

## Prerequisites

The call carries 3 required constraints.

| Item                      | Detail                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State PATHS explicitly    | `run` / `scan` / `outline` default PATHS to the whole current directory (`.`). Never omit it; state the target path on every call                                           |
| `-U` on a clean tree only | `-U` applies every rewrite without confirmation. Confirm a clean tree with `git status` before running it, and never run it on a dirty tree                                 |
| `.ja/` in the same pass   | When the target has a `.ja/` counterpart (see MIRROR.md), process both the `.ja/` side and the English side in the same session. Rewriting one side alone breaks the mirror |

## The help output is authoritative

Options, output format and exit codes live in `ast-grep --help` and `ast-grep <subcommand> --help`. Where help and memory differ, help is right.
