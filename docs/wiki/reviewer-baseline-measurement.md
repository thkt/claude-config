---
globs: ["**/agents/reviewers/**", "**/agents/critics/**"]
---

# reviewer の新設と再構築は Recall と FP を測ってから閉じる

## 内容

reviewer 系の agent を新しく作る、または作り直すときは、test corpus に対する Recall と FP Rate を測ってから issue を閉じる。観点を足しただけでは、拾えるようになったのか誤検出が増えただけなのかが分からない。

## 定型手順

1. 対象の観点を含む test corpus を用意する
2. 変更前の Recall と FP Rate を測る
3. 変更後に同じ corpus で測り直す
4. 両方の数値を issue へ書いてから close する

## 参照コード

- `skills/_lib/review_score.py`（corpus から Recall と FP Rate を出す）
- `rules/development/TESTING.md` の reviewer の行（測定を要求する側）

## 根拠

- #24 reviewer-security の test corpus へ Indirect Prompt Injection パターンを足した
- #28 reviewer-design の浅いモジュール検出へ deletion test を足した
- #43 reviewer-design を言語非依存の deletion test として再構築した
