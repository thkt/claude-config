---
status: "accepted"
date: 2026-02-27
decision-makers: thkt
---

# explorer のファイル文脈に Index-time storage を採用

## Context and Problem Statement

yomu の explorer は検索結果として孤立したチャンク（関数単体、型定義単体）を返す。AI がこの結果を受け取った後、import 先や同一ファイル内の関連コードを把握するために追加の grep/read が必要になり、tool call 数が膨らむ（典型的に 5 回 → 必要な情報が揃うまで）。

チャンクにファイル文脈（imports + siblings）を付加することで、AI の後続探索を 60% 削減できる見込み。この文脈をどのタイミングで取得するかが設計上の判断ポイント。

## Decision Drivers

- AI に渡す情報の**整合性**（チャンクと文脈が同じ時点のスナップショットであること）
- 既存アーキテクチャとの**一貫性**（indexer が全処理、query は引くだけ）
- 実装の**シンプルさ**（変更ファイル数、行数）
- 既存 index への**後方互換性**

## Considered Options

### A: Index-time storage

indexing 時に import 文を `file_context` テーブルに保存。query 時は DB から取得のみ。

- Good: チャンクと imports が同一時点でキャプチャされ、常に整合する
- Good: query 時にファイル I/O 不要（DB 読み取りのみ）
- Good: ファイルが削除/移動されても indexed データは残る
- Good: 「indexer が前処理、query は引くだけ」のアーキテクチャに合致
- Bad: スキーマ追加（`file_context` テーブル）
- Bad: 既存 index は re-index するまで imports が空
- Bad: 変更が 4 ファイルに及ぶ（chunker, storage, indexer, tools）

### B: Query-time enrichment

検索後にソースファイルを読んで imports を抽出。スキーマ変更なし。

- Good: 変更が 3 ファイルのみ（chunker, storage, tools）
- Good: 既存 index で即座に機能する（re-index 不要）
- Good: スキーマ変更なし
- Bad: **index 後にファイルが変更された場合、チャンク（旧コード）と imports（新コード）が不整合になる**
- Bad: query 時にファイル I/O が発生（ファイル削除時は失敗）
- Bad: 「indexer が前処理」のアーキテクチャから逸脱

## Decision Outcome

A: Index-time storage を採用。

最大の理由はデータ整合性。B では index 後にファイルが変更されると、DB 内のチャンク（旧コード）とディスクから読んだ imports（新コード）が食い違い、AI に不正確な文脈を渡すリスクがある。imports は表示専用データだが、不正確な表示は AI の判断を誤らせるため、整合性は非機能要件ではなく機能的な正しさの問題。

実装コストの差（3 ファイル vs 4 ファイル、~140 行 vs ~200 行）は許容範囲内。

### ポジティブな結果

- チャンクと imports が常に同じバージョンのソースから取得される
- query パスにファイルシステム依存が入らない
- 既存の「indexer → storage → query」パイプラインの延長線上で実装できる

### ネガティブな結果

- 既存ユーザーは re-index するまで imports が表示されない
- `replace_file_chunks` のシグネチャが変わり、全呼び出し箇所の修正が必要

## トレードオフ

| 得たもの             | 犠牲にしたもの                  |
| -------------------- | ------------------------------- |
| データ整合性         | 即時利用（re-index が必要）     |
| アーキテクチャ一貫性 | 実装のシンプルさ（+1 ファイル） |

## 補足: 方針転換の経緯

当初のレビューで A を推奨 → 深掘り時に「B の方がシンプル」として B に傾く → ユーザーから「効果の高い方を優先すべき」と指摘 → データ整合性の差異を再評価し A に確定。

この経緯から得た教訓: **シンプルさは重要だが、出力品質に関わる整合性とはトレードオフにならない。** Occam's Razor は「同じ結果を出す中で最もシンプルな方法」を選ぶ原則であり、結果の品質が異なる場合は適用条件を満たさない。

## Reassessment Triggers

- index 後のファイル変更頻度が下がり、query-time 読み出しでも不整合が起きなくなったとき
- index に載せる文脈が増え、DB サイズか再 index の所要時間が実運用で許容できなくなったとき
