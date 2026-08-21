---
name: use-cli-codegraph
description: Symbol-level code structure queries via codegraph CLI. Callers, callees, change impact, and symbol source trails.
when_to_use: who calls this, what breaks if I change X, impact analysis, callers, callees, call graph, symbol definition, code structure navigation, 影響範囲, 呼び出し元, 呼び出し先, 構造把握, 変更波及, dependency trace, 誰が呼んでいる
allowed-tools: Bash(codegraph:*) Read
user-invocable: false
---

# use-cli-codegraph

## When to use

Structural queries only. Route symbol-level structure questions like who calls X or what breaks to codegraph, and keep free-text content search on Grep / Explore.

| Question                                | Tool                                      |
| --------------------------------------- | ----------------------------------------- |
| What breaks if I change X / who calls X | codegraph; Grep cannot trace structure    |
| Symbol definition + caller/callee trail | codegraph node / explore                  |
| Tests affected by changed files         | codegraph affected                        |
| Free-text or string content search      | Grep / Explore; codegraph is symbol-level |
| Repo without a `.codegraph` index       | Grep / Explore, or prompt to init         |

## Commands

| Purpose                            | Command                         |
| ---------------------------------- | ------------------------------- |
| Change impact (what breaks)        | `codegraph impact <symbol>`     |
| Callers                            | `codegraph callers <symbol>`    |
| Callees                            | `codegraph callees <symbol>`    |
| Symbol source + call trail         | `codegraph node <name>`         |
| Explore area (source + call paths) | `codegraph explore <query...>`  |
| Symbol search                      | `codegraph query <search>`      |
| Tests affected by changes          | `codegraph affected [files...]` |
| Index status                       | `codegraph status`              |

## Prerequisites

| Item      | Detail                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| index     | `.codegraph/` required. Run `codegraph init` once per repo. If absent, ask whether to init and stop. Do not create it silently  |
| freshness | `codegraph status` shows up to date. Run `codegraph sync` after large changes. The watcher daemon keeps it current when running |
| binary    | Installed as a bun global. On EPERM during install / upgrade, prefix `npm_config_cache=$TMPDIR/cg` to work around it            |

## The help output is authoritative

Options, output format and exit codes live in `codegraph --help` and `codegraph <subcommand> --help`. Where help and memory differ, help is right.
