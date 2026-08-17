---
name: preview
description: PR への AI スクリーニングレビュー。人間レビュー前の予備チェック。深い multi-reviewer コード品質監査には使わない (/audit を使う)。
when_to_use: スクリーニング, PRレビュー, プレビュー, preview PR, pre-review
allowed-tools: Bash(git:*) Bash(gh:*) Read AskUserQuestion Bash(ugrep:*) Bash(bfs:*)
model: opus
argument-hint: "[PR URL or number]"
---

# /preview - PR スクリーニングレビュー

## 入力

`$ARGUMENTS` は URL、番号、または空。空なら現在ブランチから検出する。

## 実行

1. `gh pr view $ARGUMENTS --json number,title,body,labels,files,url` で PR を識別する。失敗したら `$ARGUMENTS` なしで再実行する
2. PR がない、または作業ツリーが dirty なら中止する。判定は `git status --porcelain`
3. `gh pr checkout $PR` で PR を checkout する
4. PR コンテキストを並列収集する (§ PR コンテキスト収集)
5. 各変更ファイルを diff hunks 外も含めて全体を読む
6. プロセスに沿ってレビュー: 概観 → ファイルごと → 依存影響 → findings
7. 構造化スクリーニングレポートを出力

### PR コンテキスト収集

gh の出力フィールドに `author` を含めない。

```bash
# 差分
gh pr diff $PR

# 既存コメント
gh pr view --comments $PR

# inline コメント
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  --jq '.[] | {file: .path, user: .user.login, comment: .body}'
```

## コメントラベル

| ラベル   | 意味                             | 重大度 |
| -------- | -------------------------------- | ------ |
| `[must]` | merge 前に修正必須               | High   |
| `[want]` | 修正すべき、ブロックしない       | Medium |
| `[imo]`  | 個人意見、採用は任意             | Low    |
| `[ask]`  | 明確化のための質問               | -      |
| `[nits]` | 軽微なスタイル/フォーマット問題  | Low    |
| `[info]` | コンテキスト共有、アクション不要 | -      |

## コメントトーン

| ルール   | 詳細                                                                       |
| -------- | -------------------------------------------------------------------------- |
| 形式     | `[label] <observed behavior or risk>. <suggestion>. (file:line)`           |
| 簡潔     | `[imo]`/`[nits]`/`[info]` は 3 行、`[must]`/`[want]` は根拠付きで最大 5 行 |
| 敬意     | 努力を認める、命令を避ける                                                 |
| 提案的   | "Consider..." を使い、"This is wrong" は避ける                             |
| 著者向け | コメントはそのまま投稿されうるため、PR 著者向けに詳細度を調整              |

## 出力

${CLAUDE_SKILL_DIR}/templates/screening-report.md の骨格でレポートを生成し、会話に出力する。

## ルール

| ルール         | 詳細                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| 自動投稿しない | コメントを PR に自動投稿しない                                         |
| dirty で中止   | uncommitted changes があれば警告して中止                               |
| 深さより速さ   | これはスクリーニング、フル監査ではない                                 |
| flag 前に検証  | [ask]/[want]+ 前に、問題を到達可能なランタイム呼び出し箇所まで追跡する |

## 参照

| トピック         | ファイル                                           |
| ---------------- | -------------------------------------------------- |
| Review Checklist | ${CLAUDE_SKILL_DIR}/references/review-checklist.md |
