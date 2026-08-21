---
name: use-cli-scout
description: Web search, page fetch, and GitHub repo exploration via scout CLI.
when_to_use: input containing http:// or https://, a URL was given, this page, this article, the linked page, a github.com URL, a slack.com permalink, web search, page fetch, deep research, GitHub repo exploration, latest docs, release notes, library docs, external info, WebFetch alternative, WebSearch alternative, 最新ドキュメント, リリースノート, 外部情報
allowed-tools: Bash(scout:*) Read
user-invocable: false
---

# use-cli-scout

## When to use

Reach for scout whenever the answer depends on something on the web. It returns the page body itself, so the answer can rest on the primary source. When the input carries an `http://` or `https://` URL, fetch it before answering. When unsure, fetch.

## Commands

### When a URL is given

`repo-overview` and `repo-read` accept a full URL as well as `owner/repo`. A Slack permalink is detected by `fetch` and routed to the Slack Web API.

| URL shape                                     | Command                               |
| --------------------------------------------- | ------------------------------------- |
| `github.com/<owner>/<repo>`                   | `scout repo-overview <url>`           |
| `github.com/<owner>/<repo>/blob/<ref>/<path>` | `scout repo-read <owner/repo> <path>` |
| anything else (Slack permalinks included)     | `scout fetch <url>`                   |

### Researching

`-l ja` and `-l en` pin the search language, which is auto by default. Add `--js` for a page that renders through JavaScript, `--raw` for the whole page rather than the extracted article.

| What you want     | Command                            | What comes back                        |
| ----------------- | ---------------------------------- | -------------------------------------- |
| Candidate sources | `scout search "query"`             | One URL per line                       |
| A topic's bodies  | `scout research "topic" -d <1-10>` | Markdown report over the top N fetched |
| One page's body   | `scout fetch <url>`                | Extracted body as Markdown             |

### Walking a GitHub repo

`--ref` selects a branch, tag, or commit SHA.

| Step                                                              | Command                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| The repo at a glance (description, issues, PRs, releases, README) | `scout repo-overview <owner/repo>`                           |
| File layout                                                       | `scout repo-tree <owner/repo> [-p <dir>] [--pattern '*.rs']` |
| A file's contents                                                 | `scout repo-read <owner/repo> <path> [-l 1-80]`              |

## Prerequisites

| Environment variable | What its absence costs                            |
| -------------------- | ------------------------------------------------- |
| `SLACK_TOKEN`        | Fetching a Slack permalink fails                  |
| `GITHUB_TOKEN`       | The GitHub rate limit drops; fetching still works |

## Pitfalls

`fetch` exits 0 even when the body never arrives. Read ${CLAUDE_SKILL_DIR}/references/fetch-failures.md when any of these shows up in the returned Markdown. The body is short. The table separator rows are gone. Headings run into the body text. Line numbers do not line up. The way around crates.io, builder.aws.com, zenn.dev, GitHub wikis, GitLab, the docs.rs source viewer, and x.com is there too.

## The help output is authoritative

Environment variables, options, the `--json` envelope, exit codes and stdin input live in `scout --help` and `scout <subcommand> --help`. Where help and memory differ, help is right. The Environment section of `scout --help` answers why a run exited 64.
