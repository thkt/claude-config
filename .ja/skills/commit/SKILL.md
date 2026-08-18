---
name: commit
description: Git diff を分析し Conventional Commits 形式のメッセージを生成してコミットを実行する。
when_to_use: コミットして, コミット作成, commit changes
allowed-tools: Bash(git:*) Bash(cat:*) Bash(mv:*)
model: haiku
argument-hint: "[context or issue reference]"
---

# /commit - Git コミット実行

## 入力

`$ARGUMENTS` はコンテキストまたは Issue 参照を含み得る。空白を除去し、空文字列ならステージ済み変更のみで解析する。非空ならメッセージの scope やフッターのヒントとして扱う。

## 実行

1. `git status` と `git diff --staged` を並列で実行し、ステージ済み変更を読む
2. 変更内容と `$ARGUMENTS` から、メッセージを 1 つ生成する (§ 種別判定, § ルール)
3. sandbox 互換コミットでそのままコミットを実行する

## 種別判定

diff のコンテキストから type を推定する。判別できないときは chore とする。feat は semver の minor を上げる宣言になるので、根拠がないまま選ばない。

| Type     | 用途                           |
| -------- | ------------------------------ |
| feat     | 新しい機能や能力               |
| fix      | バグ修正やエラー訂正           |
| refactor | 振る舞いを変えないコード再構成 |
| docs     | ドキュメントのみの変更         |
| test     | テストの追加や更新             |
| chore    | 設定、依存、メンテナンス       |
| perf     | パフォーマンス最適化           |
| style    | フォーマット、空白、lint       |
| ci       | CI/CD 設定の変更               |

## ルール

メッセージは `<type>(<scope>): <subject>` の形に組み立てる。破壊的変更は `feat(api)!:` のように type の後へ `!` を付ける。部位ごとの規則は下表が定める。

| 部位    | 規則                                                                    |
| ------- | ----------------------------------------------------------------------- |
| Subject | 72 文字以内。命令形、小文字、末尾のピリオドなし                         |
| Body    | 動機や判断の理由など diff から読み取れない why を書く。自明なら省略する |
| Footer  | `BREAKING CHANGE:`、`Closes #123`、`Co-authored-by:` を使う             |

## Sandbox 互換コミット

先頭の `git rev-parse --show-toplevel` で対象リポジトリを確かめる。

```bash
git rev-parse --show-toplevel
cat > "$TMPDIR/commit-msg.txt" << 'EOF'
<message>
EOF
git commit -F "$TMPDIR/commit-msg.txt"
mv "$TMPDIR/commit-msg.txt" ~/.Trash/ 2>/dev/null || true
```

## エラー処理

| エラー                 | 扱い                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| ステージ済みなし       | コミットせず、ステージが空であることを報告する                       |
| 空の diff              | 最小限のメッセージでコミットする                                     |
| git リポジトリでない   | コミットせず、その旨を報告する                                       |
| リポジトリが意図と違う | コミットせず、`git rev-parse --show-toplevel` の出力を報告する       |
| pre-commit 失敗        | フックの出力をそのまま報告する。直して再実行するかはユーザーが決める |
