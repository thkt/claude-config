---
name: use-cli-codegraph
description: codegraph CLI 経由でシンボル単位のコード構造を問い合わせる。呼び出し元、呼び出し先、変更の波及範囲、シンボルの定義元をたどる。
when_to_use: who calls this, what breaks if I change X, impact analysis, callers, callees, call graph, symbol definition, code structure navigation, 影響範囲, 呼び出し元, 呼び出し先, 構造把握, 変更波及, dependency trace, 誰が呼んでいる
allowed-tools: Bash(codegraph:*) Read
user-invocable: false
---

# use-cli-codegraph

## 使いどころ

構造の問い合わせに限る。誰が X を呼ぶか、何が壊れるかといったシンボル単位の構造の問いを codegraph へ回し、自由記述の内容検索は Grep と Explore に残す。

| 問い                                       | ツール                                   |
| ------------------------------------------ | ---------------------------------------- |
| X を変えると何が壊れるか / 誰が X を呼ぶか | codegraph。Grep は構造をたどれない       |
| シンボルの定義元と呼び出し元 / 先の経路    | codegraph node / explore                 |
| 変更したファイルが影響するテスト           | codegraph affected                       |
| 自由記述や文字列の内容検索                 | Grep / Explore。codegraph はシンボル単位 |
| `.codegraph` index を持たないリポジトリ    | Grep / Explore。または init を促す       |

## コマンド

| 目的                                | コマンド                        |
| ----------------------------------- | ------------------------------- |
| 変更の波及範囲 (何が壊れるか)       | `codegraph impact <symbol>`     |
| 呼び出し元                          | `codegraph callers <symbol>`    |
| 呼び出し先                          | `codegraph callees <symbol>`    |
| シンボルの定義元と呼び出しの経路    | `codegraph node <name>`         |
| 領域の探索 (定義元と呼び出しの経路) | `codegraph explore <query...>`  |
| シンボル検索                        | `codegraph query <search>`      |
| 変更が影響するテスト                | `codegraph affected [files...]` |
| index の状態                        | `codegraph status`              |

## 前提

| 項目     | 詳細                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| index    | `.codegraph/` が要る。リポジトリごとに `codegraph init` を 1 回実行する。無い場合は init するか尋ねて止まる。黙って作らない        |
| 鮮度     | `codegraph status` が up to date を示す。大きな変更の後は `codegraph sync` を実行する。watcher daemon が動いていれば最新に保たれる |
| バイナリ | bun global で導入する。インストールや更新で EPERM が出たら `npm_config_cache=$TMPDIR/cg` を前置して回避する                        |

## 正典は help 出力

オプション、出力形式、終了コードは `codegraph --help` と `codegraph <subcommand> --help` にある。help と記憶が食い違えば help が正しい。
