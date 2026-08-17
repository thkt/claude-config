---
name: pr
description: ブランチ変更を分析して PR を作成する。prose review で本文を投稿前に精査する。
when_to_use: PR作って, プルリクエスト, pull request, PR作成
allowed-tools: Bash(git:*) Bash(gh:*) Read AskUserQuestion Skill
model: opus
argument-hint: "[issue reference or context]"
---

# /pr - Pull Request 作成

## 入力

`$ARGUMENTS` は Issue 参照またはコンテキスト。任意で、例は `#456`。空なら現在ブランチからのみ生成する。

## 言語

`~/.claude/settings.json` から `language` を読み、その言語で PR 本文を翻訳する。未設定なら英語をデフォルト。技術用語、コード、識別子は翻訳しない。

## 実行

commit なし、Git リポジトリでない、gh 認証失敗のいずれかを検出したら、エラーを報告して中止する。

1. base ブランチを検出 (§ Base ブランチ検出)
2. base ブランチを AskUserQuestion で選択する。選択肢は main, develop, 検出結果。検出結果が main か develop と一致するときは選択肢が重複するので、聞かずに検出結果を使う
3. § 分析ソースの各コマンドを並列実行する
4. UI 変更を検出 (§ UI 変更検出)
5. テンプレートを選ぶ (§ PR テンプレート)
6. 選んだテンプレートに従いタイトルと本文を生成 (§ タイトルルール)
7. ${CLAUDE_SKILL_DIR}/references/prose-review.md と、本文言語に対応する空句ファイルの基準で本文をインライン精査する。空句ファイルは日本語なら `phrases.ja.md`、英語なら `phrases.en.md`
8. PR をプレビューし、AskUserQuestion で `Create this PR?` と確認する
9. UI 変更があれば Skill で `use-workflow-pageshot` を PR 本文と共に呼ぶ (§ Pageshot 統合)
10. 現在ブランチを push (§ Push)
11. 本文を一時ファイルに書き出し、`gh pr create --title "<title>" --body-file <path>` で PR を作成する。テンプレート由来の本文は backtick や `$` を含むので、`--body` で渡すと shell に解釈される
12. pageshot 成果物があれば表示 (§ Pageshot 統合)

## 分析ソース

| カテゴリ | ソース                                 |
| -------- | -------------------------------------- |
| Changes  | `git diff <base>...HEAD`               |
| Commits  | `git log <base>..HEAD`                 |
| Files    | `git diff --name-status <base>...HEAD` |

## Base ブランチ検出

```bash
BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
BASE=${BASE:-main}
```

## UI 変更検出

§ 分析ソースの diff を読み込んで視覚出力への影響を判断する。ロジック/型/テスト/ドキュメントのみの変更は UI 変更なしとして § Pageshot 統合をスキップする。最終判定は pageshot のレンダリングが担うので、frontend シグナルがあって影響が曖昧なら UI 変更ありに倒す。以下のいずれかで視覚出力に影響する変更があれば UI 変更とみなす。

- JSX/テンプレート/HTML のマークアップ
- CSS/クラス名/インラインスタイル
- 色/間隔/タイポグラフィのデザイントークン
- 画像/アイコン/フォントのアセット
- `tailwind.config` などスタイル生成 config

## タイトルルール

- Issue 参照ありなら Issue タイトルをそのまま使う
- Issue 参照なしなら 72 文字以内の命令形動詞 + 説明
- `feat:` や `fix:` のような prefix は付けない。Issue タイトルにあれば外す

## PR テンプレート

- リポジトリに PR テンプレートがあればそれを利用、なければ同梱の ${CLAUDE_SKILL_DIR}/templates/pr.md を使う
- case-insensitive、`.github/pull_request_template.md` > `pull_request_template.md` > `docs/pull_request_template.md` > `PULL_REQUEST_TEMPLATE/` ディレクトリの順で優先する
- `gh pr create` はテンプレを自動適用しないので、骨格を読み取って本文に組み込む
- UI 変更検出時にリポジトリテンプレを採用するなら、§ Pageshot 統合が要求する 2 項目を補う

## Design Decisions の検出

`Design Decisions` は commit 単位でなく PR 全体で集約し、§ 分析ソースの diff と log から検出する。以下のシグナルがあれば記載し、明示的なトレードオフがなくルーチンな実装だけなら省略する。

- 同等な代替肢の中で明示的に選択
- パフォーマンス/型/互換性のトレードオフ
- 既存パターンからの逸脱
- ライブラリ/API の選定

## Pageshot 統合

`Skill("use-workflow-pageshot")` を現在の PR 本文文字列を入力に呼ぶ。本文には上部近くの `Preview URL: <URL>` 行と、番号付きリストの `## How to Test` セクションが必要。skill は stdout に mode 行を 1 つ返す。

- `mode=screenshot artifact=<path>`/`mode=video artifact=<path>` パスを表示し、GitHub の PR 説明か最初のコメントへドラッグ & ドロップするよう案内
- `mode=failed` 欠落項目を報告し、pageshot をスキップして PR 作成を続行

## Push

§ 実行 step 8 で承認されたら、`git push -u origin HEAD` で現在ブランチを push する。

## 表示形式

プレビューはタイトル、base ブランチ、現在ブランチ、サマリー bullets、変更テーブルを表示する。成功時は `Created PR: #<number> <title> <PR URL>` を表示する。
