---
name: preview
description: PR の diff を issue の `## Plan` 節と突き合わせ、未実装の unit、欠けたテスト、スコープ外の変更を返す。
when_to_use: plan 整合性, PR確認, preview PR, plan と突き合わせ
allowed-tools: Bash(git:*) Bash(gh:*) Read
model: opus
argument-hint: "[PR URL or number]"
---

# /preview - Plan 整合性の確認

## 入力

`$ARGUMENTS` は PR の URL、番号、または空。空なら現在ブランチから検出する。

## 実行

1. `gh pr view $ARGUMENTS --json number,title,body,files,url` で PR を識別する。失敗したら `$ARGUMENTS` なしで再実行する
2. PR が無い、または作業ツリーが dirty なら中止する。判定は `git status --porcelain`
3. 意図のソースを特定する (§ 意図のソース)
4. `gh pr diff $PR` を読み、§ チェックの各項目を判定する
5. § 出力形式で結果を出す

## 意図のソース

上から順に探し、最初に見つかったものを使う。

1. 起点の issue の `## Plan` 節。ブランチ名や commit message の issue 参照から `gh issue view <N>` で取る
2. `.claude/workspace/planning/` の `*.plan.md`。ブランチ名か PR タイトルに一致するもの
3. PR 説明と commit message。ここまで落ちたときは U-NNN と T-NNN の行を飛ばし、Scope creep と Impl-wrong だけを見る

## チェック

各フラグには根拠となる plan の行を引用する。引用の無い `missing` と `wrong` は根拠が無いので落とす。

| チェック      | ソース                               | 条件      | フラグ       |
| ------------- | ------------------------------------ | --------- | ------------ |
| Unit coverage | `## Plan` 節の U-NNN unit            | plan あり | missing      |
| Test coverage | `## Plan` 節の T-NNN 受け入れテスト  | plan あり | missing      |
| Scope creep   | diff vs 意図のソース                 | 常時      | out-of-scope |
| Impl-wrong    | diff の振る舞い vs unit goal / T-NNN | 常時      | wrong        |

## 出力形式

会話に出す。ファイルには保存せず、PR にも投稿しない。

```text
Plan Alignment: [CLEAN | MISSING <N> | OUT-OF-SCOPE <N> | WRONG <N> | MIXED]
Intent source: <issue #N Plan section | *.plan.md path | PR description | commit messages>
Missing (U): U-NNN - <description> (plan: "<quoted line>")
Missing (T): T-NNN - <description> (plan: "<quoted line>")
Out-of-scope: <file or area> - not traceable to stated intent
Wrong: <U-NNN/T-NNN> - implemented but <gap> (plan: "<quoted line>")
```
