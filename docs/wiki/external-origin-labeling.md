---
globs: []
scenes: []
---

# 外部発想の issue に origin を残す

## 内容

他所で見た仕組みを自分のリポジトリへ持ち込むとき、その issue に `source:<origin>` ラベルを付ける。origin は発想元を指す短い識別子で、リポジトリ名かサービス名を kebab-case で書く。後から「この仕組みはどこから来たのか」を issue 一覧の絞り込みだけで辿れる状態にする。

## 定型手順

1. 外部の記事、リポジトリ、発表から発想した issue を起票する
2. `source:<origin>` ラベルが無ければ `gh label create` で作る。説明文に発想元を書く
3. issue にそのラベルを付ける
4. 色は既存の `source:*` と揃える。1 prefix 1 色の規律に従う

## 参照コード

- `skills/issue/SKILL.md` の `Publishing constraints`（ラベル付与の手順。source 系は「Other labels follow the repository's conventions」に当たる）

## 由来

- `docs/decisions/0059-adopt-tier-3-lite-github-label-strategy.md`（prefix + `:` + kebab-case という命名規約と 1 prefix 1 色を決めた DR）

## 根拠

- #30 ADR 採用基準の 3 条件を追加。`source:mattpocock-skills`
- #31 TDD ワークフローに horizontal slices 禁止を明文化。`source:mattpocock-skills`
- #32 issue テンプレートに Testing Decisions セクションを追加。`source:mattpocock-skills`
- #33 caveman 圧縮モードを追加。`source:mattpocock-skills`
- #39 Scout 風の docs index 強制読み込みを research skill へ組み込む。`source:gmo-orchestrator-blog`
- #40 大型 docs の自動分割を実装。`source:gmo-orchestrator-blog`
- #41 トークン消費 before/after の測定 harness を整備。`source:gmo-orchestrator-blog`
