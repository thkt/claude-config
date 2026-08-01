---
name: use-cli-scout
description: Web search, page fetch, and GitHub repo exploration via scout CLI.
when_to_use: web search, page fetch, deep research, GitHub repo exploration, latest docs, release notes, library docs, external info, WebFetch alternative, WebSearch alternative, 最新ドキュメント, リリースノート, 外部情報
allowed-tools: Bash Read
user-invocable: false
---

# use-cli-scout

## Commands

| Purpose       | Command                               |
| ------------- | ------------------------------------- |
| Web search    | `scout search "query"`                |
| Fetch page    | `scout fetch <url>`                   |
| Deep research | `scout research "topic"`              |
| Repo tree     | `scout repo-tree <owner/repo>`        |
| Repo read     | `scout repo-read <owner/repo> <path>` |
| Repo overview | `scout repo-overview <owner/repo>`    |

## The help output is authoritative

Required environment variables, options, the `--json` envelope, exit codes, stdin input, and examples are all written in `scout --help` and `scout <subcommand> --help`. When answering about scout itself, answer from the installed version's help output rather than from this skill or from training knowledge. When the two disagree, help wins.

| Situation                                      | Command to run                                       |
| ---------------------------------------------- | ---------------------------------------------------- |
| Environment variables, exit codes, global flags | `scout --help`                                       |
| A subcommand's arguments and flags             | `scout <subcommand> --help`                          |
| A run failed with exit 64 (missing API key too) | Read the Environment section of `scout --help`       |

## When to Use

| use-cli-scout                      | Built-in WebFetch / WebSearch      |
| ---------------------------------- | ---------------------------------- |
| Latest docs, release notes         | Never; scout preferred             |
| GitHub repository exploration      | Never; scout repo-\* preferred     |
| Deep research with compiled report | Unavailable; use scout research    |
| Markdown-clean page extraction     | WebFetch lacks Markdown conversion |
