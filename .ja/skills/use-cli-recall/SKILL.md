---
name: use-cli-recall
description: recall CLI 経由で過去の Claude Code/Codex セッションを検索する。
when_to_use: 前に, あの時, また同じ, あの件, past decisions, recurring mistake, module first contact, temporal reference, structural echo, vague back-reference
allowed-tools: Bash(recall:*) Read
user-invocable: false
---

# use-cli-recall

## 使いどころ

該当したら検討せず呼び出す。過去の判断は recall、現在のコード状態は `ugrep`/`bfs` が答えるので、コード検索の欄があるトリガーでは両方を並列に走らせる。

| トリガー           | シグナル                                    | 同時に走らせるコード検索   |
| ------------------ | ------------------------------------------- | -------------------------- |
| 時間的参照         | 「前に」「あの時」過去の出来事 / 判断       | -                          |
| 構造的エコー       | 現在の問題が過去の状況と似ている            | 現在の類似コード           |
| 繰り返し           | 「また同じ」反復ミス                        | -                          |
| 曖昧な後方参照     | 「あの件」具体性のない過去の作業            | -                          |
| モジュール初回接触 | このセッションでファイル / モジュール初編集 | モジュール名、主要な識別子 |

## コマンド

モジュール初回接触では `--file` を使う。そのファイルを触ったセッションだけに絞れるので、モジュール名での全文検索より当たりが正確になる。

| 目的                 | コマンド                                                        |
| -------------------- | --------------------------------------------------------------- |
| 検索                 | `recall search "query"`。短縮形は `recall "query"`              |
| 直近 N 日            | `recall search "query" --days N`                                |
| プロジェクトフィルタ | `recall search "query" --project <path>`                        |
| ファイルフィルタ     | `recall search "query" --file <path>`                           |
| ソースフィルタ       | `recall search "query" --source claude` または `--source codex` |
| 結果数制限           | `recall search "query" --limit N`。デフォルト 10、最大 100      |
| セッション表示       | `recall show <session-id>`                                      |
| ステータス           | `recall status`                                                 |
| 増分インデックス     | `recall index`                                                  |
| 完全リビルド         | `recall rebuild`                                                |

## 落とし穴

最初から二言語クエリを書く (例 `recall "認証 auth"`)。FTS5 の trigram トークナイズは 2 文字以下の日本語語句にマッチせず、認証や依存は 0 件になる。embedding は EN⇄JA を橋渡ししない (thkt/recall#51)。両言語を含めることで各検索経路をカバーする。

recall はクエリを拡張しない (caller-is-LLM, thkt/recall#25)。ハイブリッド検索は最近傍を返すため、貧弱なクエリは 0 件ではなく低関連の結果になる。結果が空または低関連のときは、同義語、EN⇄JA バリアント、関連概念語を使ってクエリを書き直し、1 回リトライする。

## 正典は help 出力

オプション、フィルタ、exit code は `recall --help` と `recall <subcommand> --help` にある。help と記憶が食い違えば help が正しい。
