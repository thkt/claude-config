---
globs: ["**/workflows/build/**/*"]
scenes: ["pr-create"]
---

# PR 本文の翻訳は情報系 prose のみ、構造化フィールドは verbatim

## 内容

build が生成する PR 本文のうち、自由記述の情報系セクション (assumptions、backlog、findings 等) だけを利用者設定の言語へ翻訳する。`Closes`、ステータス行、file:line、severity、コマンド名などの構造化フィールドは翻訳せず原文のまま保つ。構造化フィールドを翻訳すると自動 close や後続処理が壊れる。

## 定型手順

1. PR 本文の各セクションを情報系 prose と構造化フィールドに仕分ける
2. `Closes #N`、ステータス行、file:line、severity、コマンド名は翻訳対象から外す
3. 情報系 prose だけを翻訳し、必要なら軽く圧縮する
4. 翻訳の反映は id 突合で行い、順序のずれで取り違えないようにする
5. 翻訳が揃わない、または一部欠落する場合は原文のまま出力する (fail-open)

## 参照コード

- `workflows/build/pr-body.py` (`Only prose labels translate; the GitHub keyword Closes, the code-fenced status line...stay verbatim` の設計コメント)

## 根拠

- #175 ship phase に `translate-tail` agent を追加し、情報系セクションのみ翻訳、安全事実と構造化フィールドは決定論のまま維持した
- #176 pr-body.py の見出しラベルを body 言語へ翻訳し、`Closes`・status 行・`/issue` は verbatim 維持した
