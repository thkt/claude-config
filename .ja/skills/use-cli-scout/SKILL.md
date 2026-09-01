---
name: use-cli-scout
description: scout CLI 経由で Web 検索、ページ取得、GitHub リポジトリ探索を行う。
when_to_use: http:// または https:// を含む入力, URL を渡された, このページ, この記事, リンク先, github.com の URL, slack.com の permalink, web search, page fetch, deep research, GitHub repo exploration, latest docs, release notes, library docs, external info, WebFetch alternative, WebSearch alternative, 最新ドキュメント, リリースノート, 外部情報
allowed-tools: Bash(scout:*) Bash(xr:*) Bash(agent-browser:*) Read
user-invocable: false
---

# use-cli-scout

## 使いどころ

Web 上の情報が要るときは scout を使う。ページの本文がそのまま返るので、一次ソースを直接読んで答えられる。入力に `http://` または `https://` の URL があれば、答える前に取得する。迷ったら取得する。

## コマンド

### URL を渡されたら

`repo-overview` と `repo-read` は完全な URL と `owner/repo` のどちらでも受け付ける。Slack permalink は `fetch` が判別して Slack Web API へ回す。

| URL の形                                      | コマンド                              |
| --------------------------------------------- | ------------------------------------- |
| `github.com/<owner>/<repo>`                   | `scout repo-overview <url>`           |
| `github.com/<owner>/<repo>/blob/<ref>/<path>` | `scout repo-read <owner/repo> <path>` |
| それ以外 (Slack permalink を含む)             | `scout fetch <url>`                   |

### 調べる

`-l ja` と `-l en` で検索言語を固定する (既定は auto)。JS 描画が要るページには `--js`、抽出前のページ全体には `--raw` を付ける。

| 欲しいもの         | コマンド                           | 返るもの                              |
| ------------------ | ---------------------------------- | ------------------------------------- |
| 情報源の候補       | `scout search "query"`             | 1 行 1 URL                            |
| トピックの本文一式 | `scout research "topic" -d <1-10>` | 上位 N 件を取得した Markdown レポート |
| 1 ページの本文     | `scout fetch <url>`                | 本文抽出済みの Markdown               |

### GitHub を辿る

`--ref` で branch、tag、commit SHA を指定する。

| 段階                                             | コマンド                                                     |
| ------------------------------------------------ | ------------------------------------------------------------ |
| repo の全体像 (説明、issue、PR、release、README) | `scout repo-overview <owner/repo>`                           |
| ファイル構成                                     | `scout repo-tree <owner/repo> [-p <dir>] [--pattern '*.rs']` |
| ファイルの中身                                   | `scout repo-read <owner/repo> <path> [-l 1-80]`              |

## 前提

| 環境変数       | 無いとどうなるか                            |
| -------------- | ------------------------------------------- |
| `SLACK_TOKEN`  | Slack permalink の取得が失敗する            |
| `GITHUB_TOKEN` | GitHub のレート上限が下がる。取得自体は通る |

## 落とし穴

`fetch` は本文が取れなくても exit 0 で返る。返った Markdown に次のいずれかが出たら ${CLAUDE_SKILL_DIR}/references/fetch-failures.md を読む。本文が短い。表の区切り行が無い。見出しが本文と混ざる。行番号が合わない。crates.io と builder.aws.com と zenn.dev、GitHub の wiki、GitLab、docs.rs のソースビューア、x.com の迂回路もそこにある。

## 正典は help 出力

環境変数、オプション、`--json` envelope、exit code、stdin 入力は `scout --help` と `scout <subcommand> --help` にある。help と記憶が食い違えば help が正しい。exit 64 の原因は `scout --help` の Environment セクションが答える。
