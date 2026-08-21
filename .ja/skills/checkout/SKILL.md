---
name: checkout
description: Git の変更を解析し、適切な名前で新しいブランチを作成する。
when_to_use: ブランチ作成, ブランチ切って, ブランチ名, branch name
allowed-tools: Bash(git:*)
model: haiku
argument-hint: "[context or ticket number]"
---

# /checkout - Git ブランチ作成

build の Branch 段を手で行う版。ブランチ名は同じ規則で組み立てる。

## 入力

`$ARGUMENTS` はコンテキストまたはチケット番号を含み得る。空白を除去し、空文字列なら git の変更内容のみで解析する。非空ならブランチ名のスコープやチケット ID のヒントとして扱う。

## 実行

1. `git status` と `git diff HEAD` を並列で実行し、変更内容を読む。`git diff` だけではステージ済みの変更が見えない
2. 変更内容と `$ARGUMENTS` から、ブランチ名を 1 つ決める (§ ブランチ命名)
3. `git checkout -b <決めた名前>` で新しいブランチを作成する

## ブランチ命名

名前の組み立てと type の判定は ${CLAUDE_SKILL_DIR}/references/branch-naming.md に従う。build も Branch phase で同じ規則を引く。

## エラー処理

| エラー               | 扱い                                       |
| -------------------- | ------------------------------------------ |
| 変更が無い           | ブランチを作らず、変更が無いことを報告する |
| 同名のブランチが有る | 別の名前を決めて作り直す                   |
| git リポジトリでない | ブランチを作らず、その旨を報告する         |
