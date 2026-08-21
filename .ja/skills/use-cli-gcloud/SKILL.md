---
name: use-cli-gcloud
description: gsheet と gdoc から Google Sheets と Docs の中身を読む。認証は gcloud のアクセストークンを使う。
when_to_use: Google Sheets/Docs URL, スプレッドシート, Sheets, Docs, Google ドキュメント
allowed-tools: Bash(gsheet:*) Bash(gdoc:*) Read
user-invocable: false
---

# use-cli-gcloud

## コマンド

| 種別   | URL パターン                      | 既定                 | 構造化                                      |
| ------ | --------------------------------- | -------------------- | ------------------------------------------- |
| Sheets | `docs.google.com/spreadsheets/d/` | `gsheet "URL"` (CSV) | `gsheet "URL" json` (JSONL、表形式のデータ) |
| Docs   | `docs.google.com/document/d/`     | `gdoc "URL"` (text)  | `gdoc "URL" md` (Markdown、仕様書や文書)    |

## 前提

`gsheet` と `gdoc` は shell 関数で、`gcloud auth print-access-token` からトークンを取る。`--help` は持たないので、使い方はこのページが正。

## 落とし穴

認証が切れていると本文でなく Google のエラーページが返り、崩れた CSV や HTML として見える。取得結果が表の形をしていないときは `gcloud auth login` を促して止まる。
