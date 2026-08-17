---
name: use-cli-gcloud
description: gcloud CLI 経由で Google Sheets と Docs へアクセスする。
when_to_use: Google Sheets/Docs URL, スプレッドシート, Sheets, Docs, Google ドキュメント
allowed-tools: Bash Read
user-invocable: false
---

# use-cli-gcloud

## コマンド

| 種別   | URL パターン                      | 既定                 | 構造化                                      |
| ------ | --------------------------------- | -------------------- | ------------------------------------------- |
| Sheets | `docs.google.com/spreadsheets/d/` | `gsheet "URL"` (CSV) | `gsheet "URL" json` (JSONL、表形式のデータ) |
| Docs   | `docs.google.com/document/d/`     | `gdoc "URL"` (text)  | `gdoc "URL" md` (Markdown、仕様書や文書)    |
