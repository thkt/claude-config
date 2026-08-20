---
name: pr
description: ブランチ変更を分析し、draft の pull request を作成する。base ブランチは分岐元から検出し、本文は prose review で精査してから上げる。UI 変更があればスクリーンショットを撮る。
when_to_use: PR作って, プルリクエスト, pull request, PR作成
allowed-tools: Bash(git:*) Bash(gh:*) Bash(cat:*) Read Skill
model: opus
argument-hint: "[issue reference or context]"
---

# /pr - Pull Request 作成

## 入力

`$ARGUMENTS` は Issue 参照またはコンテキスト。空なら現在ブランチからのみ生成する。

## Phase 1: 準備

commit なし、Git リポジトリでない、gh 認証失敗のいずれかを検出したら、エラーを報告して中止する。

1. base ブランチを検出する (§ Base ブランチ検出)
2. § 分析ソースの各コマンドを並列実行する
3. UI 変更の有無を判定する (§ UI 変更検出)。この判定は Phase 2 と Phase 3 が読む

## Phase 2: 生成

1. ${CLAUDE_SKILL_DIR}/references/pr-writing.md に従って骨格を選び、本文を書く。Design Decisions は § Design Decisions の検出 に従う
2. UI 変更があってリポジトリ側の骨格を採ったときは、§ Pageshot 統合 が要求する 2 項目を補う。同梱の骨格は最初から両方を持つので何もしない
3. ${CLAUDE_SKILL_DIR}/references/pr-writing.md の § タイトル に従ってタイトルを付ける
4. ${CLAUDE_SKILL_DIR}/references/prose-review.md の基準で本文をインライン精査する

## Phase 3: 作成

1. UI 変更があれば Skill で `use-workflow-pageshot` を PR 本文と共に呼ぶ (§ Pageshot 統合)
2. `git push -u origin HEAD` で現在ブランチを push する
3. 本文を一時ファイルに書き出し、`gh pr create --draft --title "<title>" --body-file <path>` で PR を作成する (§ 作成の制約)
4. pageshot 成果物があれば表示 (§ Pageshot 統合)。成功時は `Created draft PR: #<number> <title> (base: <base>) <PR URL>` を出す

## 分析ソース

`<base>` は § Base ブランチ検出 が決めた値。

| カテゴリ | ソース                                                                   |
| -------- | ------------------------------------------------------------------------ |
| Changes  | `git diff <base>...HEAD`                                                 |
| Commits  | `git log <base>..HEAD`                                                   |
| Files    | `git diff --name-status <base>...HEAD`                                   |
| Issue    | `gh issue view <ref> --json title`。`$ARGUMENTS` が issue を指すときだけ |

## Base ブランチ検出

分岐元を HEAD の reflog から取る。取れないか、それが HEAD の祖先でなければ origin の既定ブランチへ落とす。

```bash
BASE=$(git reflog --format='%gs' | grep "moving from .* to $(git branch --show-current)$" | tail -1 | sed 's/.*from \(.*\) to .*/\1/'); git merge-base --is-ancestor "$BASE" HEAD 2>/dev/null || BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'); BASE=${BASE:-main}
```

## UI 変更検出

§ 分析ソースの diff を読み、描画結果が変わらないと言い切れるかを判断する。言い切れなければ UI 変更ありとする。最終判定は pageshot のレンダリングが担うので、迷ったら UI 変更ありに倒す。

描画結果が変わらないのは、次のような変更に限る。

- 型定義、テスト、ドキュメント、コメントだけの変更
- 名前の変更や関数の抽出など、出力が同じままの整理
- ビルドやツールの設定で、生成物の見た目に触れないもの

## Design Decisions の検出

`Design Decisions` は commit 単位でなく PR 全体で集約し、§ 分析ソースの diff と log から検出する。次のシグナルがあれば記載する。

- 同等な代替肢の中で明示的に選択
- パフォーマンス/型/互換性のトレードオフ
- 既存パターンからの逸脱
- ライブラリ/API の選定

## 作成の制約

draft で上げるのは、人が本文を読んでから ready に変えるため。

この工程には確認を挟まない。draft のまま上がることと、結果行に出る base が、誤りに気付く唯一の経路になる。

本文は `--body` でなく `--body-file` で渡す。テンプレート由来の本文は backtick や `$` を含み、`--body` では shell がそれを解釈する。

## Pageshot 統合

`Skill("use-workflow-pageshot")` を現在の PR 本文文字列を入力に呼ぶ。本文には上部近くの `Preview URL: <URL>` 行と、番号付きリストの `## How to Test` セクションが必要。skill は stdout に mode 行を 1 つ返す。

- `mode=screenshot artifact=<path>`/`mode=video artifact=<path>` パスを表示し、GitHub の PR 説明か最初のコメントへドラッグ & ドロップするよう案内
- `mode=failed` 欠落項目を報告し、pageshot をスキップして PR 作成を続行
