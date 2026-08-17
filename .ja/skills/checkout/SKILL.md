---
name: checkout
description: Git の変更を解析し、適切な名前で新しいブランチを作成する。
when_to_use: ブランチ作成, ブランチ切って, ブランチ名, branch name
allowed-tools: Bash(git:*) AskUserQuestion
model: haiku
argument-hint: "[context or ticket number]"
---

# /checkout - Git ブランチ作成

## 入力

`$ARGUMENTS` はコンテキストまたはチケット番号を含み得る。空白を除去し、空文字列なら git の変更内容のみで解析する。非空ならブランチ名のスコープやチケット ID のヒントとして扱う。

## 実行

1. `git status` と `git diff HEAD` を並列で実行し、変更内容を読む。`git diff` だけではステージ済みの変更が見えない
2. 変更内容と `$ARGUMENTS` から、命名規約に沿ったブランチ名候補を 3 つ生成する
3. `AskUserQuestion` で各候補に選定理由を添えて提示し、ユーザーに 1 つ選ばせる
4. `git checkout -b <選択した名前>` で新しいブランチを作成する

## ブランチ命名

変更内容から type を判定し、次のフォーマットでブランチ名を組み立てる。各 type のトリガーは下表。

```text
<type>/<scope>-<description>
<type>/<ticket>-<description>
```

| Prefix    | 用途              | トリガー                     |
| --------- | ----------------- | ---------------------------- |
| feat/     | 新機能            | 新規ファイル、コンポーネント |
| fix/      | バグ修正          | エラー修正                   |
| refactor/ | コード改善        | 再構造化                     |
| docs/     | ドキュメント      | .md ファイル、README         |
| test/     | テスト追加 / 修正 | テストファイル               |
| chore/    | メンテナンス      | 依存、設定                   |
| perf/     | パフォーマンス    | 最適化、キャッシュ           |

- 小文字とハイフン区切りで構成し、空白/アンダースコア/CamelCase は使わない
- scope と description は 2〜4 単語で簡潔にし、update のような曖昧な語でなく変更の対象と結果を表す語を使う
- `$ARGUMENTS` にチケット ID があれば `<ticket>` の位置に含める。このスキルが作る名前に日付は入れない

## エラー処理

| エラー               | アクション                   |
| -------------------- | ---------------------------- |
| 変更なし             | 変更がない旨を報告           |
| ブランチ既存         | 代替名を提案                 |
| git リポジトリでない | git リポジトリでない旨を報告 |

## 出力

作成したブランチ名を 1 行で報告する。
