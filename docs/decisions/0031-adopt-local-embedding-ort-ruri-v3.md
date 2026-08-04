---
status: "proposed"
date: 2026-03-22
decision-makers: thkt
---

# ADR-0031: ort + Ruri v3 によるローカル embedding 基盤の構築

## Context and Problem Statement

CLIツール群（yomu, kiku）のembeddingがGemini APIに依存しており、セッションログ等の機密データが外部に送信される。recallにセマンティック検索を追加するにあたり、セッションログの外部送信は許容できない。

加えて、yomu/kikuのGemini API依存をローカル実行に移行したい長期的な意図がある。recallを最小スコープの実証場として、ort + Ruri v3のembedderを構築し、段階的にyomu/kikuに展開する。

## Decision Drivers

- セッションログは個人の作業記録であり、外部APIへの送信はセキュリティリスク
- 日本語テキストのembedding品質が最重要（JMTEBベンチで評価可能）
- recallは同期CLI（tokioなし）であり、非同期APIクライアントの導入は過剰
- yomu/kikuとの次元数互換（768）を維持し、DBマイグレーションを回避したい
- オフライン動作（飛行機、新幹線トンネル）の実現

## Considered Options

### Option 1: ort + Ruri v3-310m（ローカル ONNX 推論）

ONNX RuntimeのRustバインディング（ort crate）でRuri v3-310mを直接実行。

- Good: 完全ローカル実行。データ外部送信なし
- Good: 日本語JMTEB 77.24（SOTA）。Gemini系は日本語単体ベンチ非公開
- Good: 出力768次元がkiku/yomuのEMBEDDING_DIMSと完全一致
- Good: 無料。セッション数増加によるコストスケールの心配なし
- Good: オフライン動作可能
- Good: 最大8,192トークン（Geminiの2,048の4倍）
- Bad: ONNXモデル1.26 GBのダウンロード・管理が必要
- Bad: ortはv2.0.0-rc.12（まだRC）
- Bad: mean pooling + L2正規化を自前実装する必要あり
- Bad: community ONNX export（公式なし）への依存

### Option 2: Gemini embedding API（gemini-embedding-001）

kiku/yomuと同じGemini APIをrecallにも導入。

- Good: kikuのembedder.rsをそのままコピーフォーク可能
- Good: 実績あり（kiku/yomuで運用中）
- Good: バイナリサイズ・依存が軽い（reqwestのみ）
- Bad: セッションログの全文をGoogleに送信（セキュリティリスク）
- Bad: APIコスト（$0.15/1M tokens）がセッション数に比例
- Bad: オフライン不可
- Bad: 日本語単体ベンチ非公開

### Option 3: Gemini Embedding 2（gemini-embedding-2-preview）

最新のマルチモーダルembeddingモデル。

- Good: マルチモーダル対応（テキスト以外も扱える）
- Good: MTEB multilingualトップクラス
- Bad: 2026-03-10 Public Preview（本番非推奨）
- Bad: セッションログの外部送信（Option 2と同じ）
- Bad: $0.20/1M tokens（Option 2より高い）
- Bad: recallの用途はテキストオンリー。マルチモーダルは過剰

### Option 4: fastembed-rs（ort ラッパー）

ort + tokenizers + poolingをラップした高レベルcrate。

- Good: boilerplate削減（tokenization + pooling + normalizationが組み込み）
- Bad: Ruri v3はbuilt-inモデルリストになくUserDefinedEmbeddingModelが必要
- Bad: 1.26 GBモデルのruntime loadingに追加の工夫が必要
- Bad: 単一モデルの固定動作に対して抽象化が過剰

## Decision Outcome

Option 1: ort + Ruri v3-310mを採用。

セキュリティ（ローカル完結）と日本語品質（JMTEB SOTA）が決定要因。ortがRCであるリスクは、バージョンピンニングとrecallでの実証で管理する。

recallでembedderを実装・実証した後、独立crateに抽出してyomu → kikuの順でGemini APIから移行する。

## Technical Details

### Embedding Stack

| Component | Choice |
|-----------|--------|
| Runtime | ort v2.0.0-rc.12 |
| Model | Ruri v3-310m（keitokei1994/ruri-v3-310m-onnx、1.26 GB） |
| Tokenizer | tokenizers crate + tokenizer.json |
| Pooling | mean pooling（自前実装） |
| Normalization | L2 normalize（自前実装） |
| Prefix | query: "検索クエリ: " / document: "検索文書: " |
| Dimensions | 768（kiku/yomu 互換） |

### sync/async 戦略

recallのembedderは同期（sync）で実装する。kiku/yomuの既存 `Embed` traitはasync（`Pin<Box<dyn Future>>`）であり、直接互換性はない。

抽出時に `LocalEmbed`（sync）traitを新設し、kiku/yomu側は `spawn_blocking` でasyncにラップする。既存の `Embed`（Gemini API）は移行完了まで併存。

### 展開計画

| Phase | Target | Action |
|-------|--------|--------|
| 1 | recall | ort + Ruri v3 embedder を実装。semantic session search |
| 2 | yomu | recall の embedder を独立 crate に抽出。Gemini API を置換 |
| 3 | kiku | 同様に移行 |

## Links

- sui-memory（参考）: <https://zenn.dev/noprogllama/articles/7c24b2c2410213>
- Ruri v3: <https://huggingface.co/cl-nagoya/ruri-v3-310m>
- ort crate: <https://crates.io/crates/ort>
- kiku ADR: [ADR-0021](0021-build-slack-semantic-search-mcp-kiku.md)
