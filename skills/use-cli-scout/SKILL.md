---
name: use-cli-scout
description: Web search, page fetch, and GitHub repo exploration via scout CLI.
when_to_use: input containing http:// or https://, a URL was given, this page, this article, the linked page, a github.com URL, a slack.com permalink, web search, page fetch, deep research, GitHub repo exploration, latest docs, release notes, library docs, external info, WebFetch alternative, WebSearch alternative, 最新ドキュメント, リリースノート, 外部情報
allowed-tools: Bash(scout:*) Read
user-invocable: false
---

# use-cli-scout

Reach for scout whenever the answer depends on something on the web. It returns the page body itself, so the answer can rest on the primary source.

## When a URL is given

When the input carries an `http://` or `https://` URL, fetch it with the command below before answering. When unsure, fetch. `repo-overview` and `repo-read` accept a full URL as well as `owner/repo`. A Slack permalink is detected by `fetch` and routed to the Slack Web API (needs `SLACK_TOKEN`).

| URL shape                                     | Command                               |
| --------------------------------------------- | ------------------------------------- |
| `github.com/<owner>/<repo>`                   | `scout repo-overview <url>`           |
| `github.com/<owner>/<repo>/blob/<ref>/<path>` | `scout repo-read <owner/repo> <path>` |
| anything else (Slack permalinks included)     | `scout fetch <url>`                   |

## Researching

`-l ja` and `-l en` pin the search language, which is auto by default. Add `--js` for a page that renders through JavaScript, `--raw` for the whole page rather than the extracted article.

| What you want     | Command                            | What comes back                        |
| ----------------- | ---------------------------------- | -------------------------------------- |
| Candidate sources | `scout search "query"`             | One URL per line                       |
| A topic's bodies  | `scout research "topic" -d <1-10>` | Markdown report over the top N fetched |
| One page's body   | `scout fetch <url>`                | Extracted body as Markdown             |

## Walking a GitHub repo

`--ref` selects a branch, tag, or commit SHA. `GITHUB_TOKEN` raises the rate limit.

| Step                                                              | Command                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| The repo at a glance (description, issues, PRs, releases, README) | `scout repo-overview <owner/repo>`                           |
| File layout                                                       | `scout repo-tree <owner/repo> [-p <dir>] [--pattern '*.rs']` |
| A file's contents                                                 | `scout repo-read <owner/repo> <path> [-l 1-80]`              |

## When the fetch comes back empty

`fetch` exits 0 even when the body never arrives. Read ${CLAUDE_SKILL_DIR}/references/fetch-failures.md when any of these shows up in the returned Markdown. The body is short. The table separator rows are gone. Headings run into the body text. Line numbers do not line up. The way around crates.io, builder.aws.com, zenn.dev, GitHub wikis, GitLab, the docs.rs source viewer, and x.com is there too.

## The help output is authoritative

Required environment variables, options, the `--json` envelope, exit codes, stdin input, and examples all live in `scout --help` and `scout <subcommand> --help`. Answer questions about scout itself from the installed version's help output; where help and memory differ, help is right.

| What you need                                    | Command to run                            |
| ------------------------------------------------ | ----------------------------------------- |
| Environment variables, exit codes, global flags  | `scout --help`                            |
| A subcommand's arguments and flags               | `scout <subcommand> --help`               |
| Why a run exited 64 (a missing API key included) | The Environment section of `scout --help` |
