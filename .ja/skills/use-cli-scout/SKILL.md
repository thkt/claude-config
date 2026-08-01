---
name: use-cli-scout
description: scout CLI 経由で Web 検索、ページ取得、GitHub リポジトリ探索を行う。
when_to_use: web search, page fetch, deep research, GitHub repo exploration, latest docs, release notes, library docs, external info, WebFetch alternative, WebSearch alternative, 最新ドキュメント, リリースノート, 外部情報
allowed-tools: Bash Read
user-invocable: false
---

# use-cli-scout

## コマンド

| 目的               | コマンド                              |
| ------------------ | ------------------------------------- |
| Web 検索           | `scout search "query"`                |
| ページ取得         | `scout fetch <url>`                   |
| ディープリサーチ   | `scout research "topic"`              |
| リポジトリツリー   | `scout repo-tree <owner/repo>`        |
| リポジトリ読み取り | `scout repo-read <owner/repo> <path>` |
| リポジトリ概要     | `scout repo-overview <owner/repo>`    |

## 正典は help 出力

必須の環境変数、オプション、`--json` envelope、exit code、stdin 入力、実行例は `scout --help` と `scout <subcommand> --help` に書かれている。scout 自体について答えるときは、この skill の記述や訓練データの記憶からではなく、インストール済みバージョンの help 出力から答える。両者が食い違ったら help が勝つ。

| 状況                                      | 実行するコマンド                                |
| ----------------------------------------- | ----------------------------------------------- |
| 環境変数、exit code、グローバルオプション | `scout --help`                                  |
| サブコマンドの引数とフラグ                | `scout <subcommand> --help`                     |
| exit 64 で失敗した (API key 未設定を含む) | `scout --help` の Environment セクションを読む  |

## 使いどころ

| use-cli-scout                        | 組み込み WebFetch / WebSearch     |
| ------------------------------------ | --------------------------------- |
| 最新ドキュメント、リリースノート     | 使わない。scout を優先            |
| GitHub リポジトリ探索                | 使わない。scout repo-\* を優先    |
| 編集済みレポート付きディープリサーチ | 利用不可。scout research を使う   |
| Markdown クリーンなページ抽出        | WebFetch には Markdown 変換がない |
