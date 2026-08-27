---
name: use-cli-ast-grep
description: ast-grep CLI 経由で AST パターンによる構造検索・一括書き換えを行う。
when_to_use: AST pattern, structural search, structural rewrite, syntax-aware search, pattern-based refactor across files, code shape match, 構造検索, 構文パターン, 一括書き換え, AST 書き換え
allowed-tools: Bash(ast-grep:*) Read
user-invocable: false
---

# use-cli-ast-grep

## 使いどころ

構文木の形で一致させる検索・書き換えに限る。テキストや正規表現の一致は ugrep と bfs に、シンボル単位の呼び出しグラフは codegraph に残す。

| 問い                                          | ツール      |
| --------------------------------------------- | ----------- |
| AST パターンによる構文木単位の一致・書き換え  | ast-grep    |
| 自由記述・リテラル文字列・正規表現の検索      | ugrep / bfs |
| シンボル単位の呼び出し元 / 先・変更の波及範囲 | codegraph   |
| 既知の 1 箇所を読む・直接編集する             | Read / Edit |

## コマンド

`run` が単発の検索・書き換え、`scan` がルールファイルによる一括適用、`outline` がシンボル一覧の抽出にあたる。

| 目的                                   | コマンド                                                      |
| -------------------------------------- | ------------------------------------------------------------- |
| パターン検索                           | `ast-grep run -p '<pattern>' -l <lang> <PATHS>`               |
| パターン書き換え (対話確認あり)        | `ast-grep run -p '<pattern>' -r '<fix>' -l <lang> -i <PATHS>` |
| パターン書き換え (確認なし一括適用)    | `ast-grep run -p '<pattern>' -r '<fix>' -l <lang> -U <PATHS>` |
| ルールファイルによるスキャン・書き換え | `ast-grep scan -r <rule.yml> <PATHS>`                         |
| シンボル一覧 (構造の把握)              | `ast-grep outline -l <lang> <PATHS>`                          |
| JSON 出力                              | `ast-grep run -p '<pattern>' --json <PATHS>`                  |

## 前提

呼び出しにあたり、次の 3 つを必須の制約とする。

| 項目                  | 詳細                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| PATHS の明示          | `run` / `scan` / `outline` の PATHS はデフォルトでカレントディレクトリ全体 (`.`) になる。省略せず、対象パスを都度明示する           |
| -U はクリーンツリーで | `-U` は確認なしで全ての書き換えを適用する。実行前に `git status` でクリーンツリーであることを確かめ、汚れたツリーでは使わない       |
| `.ja/` の同時処理     | 対象に `.ja/` 対応がある (MIRROR.md 参照) 場合、`.ja/` 側と英語側の両方を同じセッションで処理する。片側だけの書き換えはミラーを崩す |

## 正典は help 出力

オプション、出力形式、終了コードは `ast-grep --help` と `ast-grep <subcommand> --help` にある。help と記憶が食い違えば help が正しい。
