---
name: use-cli-gcloud
description: Reads Google Sheets and Docs through gsheet and gdoc. Authentication comes from a gcloud access token.
when_to_use: Google Sheets/Docs URL, スプレッドシート, Sheets, Docs, Google ドキュメント
allowed-tools: Bash(gsheet:*) Bash(gdoc:*) Read
user-invocable: false
---

# use-cli-gcloud

## Commands

| Type   | URL Pattern                       | Default              | Structured                                  |
| ------ | --------------------------------- | -------------------- | ------------------------------------------- |
| Sheets | `docs.google.com/spreadsheets/d/` | `gsheet "URL"` (CSV) | `gsheet "URL" json` (JSONL, tabular data)   |
| Docs   | `docs.google.com/document/d/`     | `gdoc "URL"` (text)  | `gdoc "URL" md` (Markdown, specs/documents) |

## Prerequisites

`gsheet` and `gdoc` are shell functions taking their token from `gcloud auth print-access-token`. Neither carries a `--help`, so this page is the authority on how to call them.

## Pitfalls

With the authentication expired, Google returns an error page instead of the content, which arrives as broken CSV or HTML. When the result does not carry the shape of a table, stop and ask for `gcloud auth login`.
