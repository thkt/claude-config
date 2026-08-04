---
status: "proposed"
date: 2026-02-27
decision-makers: Project owner
---

# Adopt SQLite Reference Graph for Impact Analysis

## Context and Problem Statement

yomu はセマンティック検索でコードを「概念で探す」ことを実現しているが、「見つけたコードを変更したらどこに影響するか」には答えられない。GitNexus のようなナレッジグラフツールが注目を集める中、yomu の「1バイナリ1責務・軽量」思想を維持しながら impact analysis を実現するアプローチを決定する必要がある。

## Decision Drivers

- yomu の設計原則: 1バイナリ、依存最小、フロントエンド特化
- フロントエンドの依存関係は import ベースが支配的
- barrel file (index.ts) はフロントエンドプロジェクトで頻出
- 既存の tree-sitter + SQLite インフラを最大活用したい

## Considered Options

### Option A: SQLite Reference Graph (recursive CTE)

既存の SQLite DB に `references` テーブルを追加し、import 解析結果を保存。推移的閉包は `WITH RECURSIVE` CTE で実現する。

- Good: 新規依存ゼロ（既存 rusqlite をそのまま利用）
- Good: 1バイナリ原則を維持
- Good: index 構築と同じトランザクションで参照も保存可能
- Good: SQLite の recursive CTE は depth 制限付き推移閉包に十分
- Bad: グラフ特有のクエリ（最短パス等）は SQL で書くと冗長
- Bad: 大規模グラフ (10k+ ノード) ではグラフ DB より遅い可能性

### Option B: Graph DB (KuzuDB)

GitNexus と同様に KuzuDB を導入し、ノード（ファイル/シンボル）とエッジ（参照）でグラフを構築。Cypher クエリで柔軟な分析を実現する。

- Good: グラフクエリが自然に書ける（Cypher）
- Good: 大規模グラフでの性能が良い
- Good: パスクエリ・サブグラフ抽出が容易
- Bad: 新規依存追加（KuzuDB crate + ネイティブライブラリ）
- Bad: バイナリサイズ増大
- Bad: 既存 SQLite との二重管理（chunks は SQLite、グラフは KuzuDB）
- Bad: ビルド・クロスコンパイルの複雑化

### Option C: In-memory Graph (petgraph)

Rust の petgraph crate でインメモリグラフを構築。DB には保存せず、起動時に毎回構築する。

- Good: 最速のクエリ性能（メモリ直接アクセス）
- Good: petgraph は軽量 crate
- Bad: 起動時に全ファイルの import を再パースする必要がある
- Bad: 永続化なし（大規模プロジェクトで起動時間増大）
- Bad: MCP サーバーは長時間起動前提なので、永続化の恩恵が小さい

## Decision Outcome

**Chosen option: A (SQLite Reference Graph)**

理由:

1. **依存ゼロ**: 既存の rusqlite だけで実現可能。yomu の「1バイナリ1責務」を完全に維持
2. **十分な性能**: フロントエンドプロジェクト (1k-5k ファイル) の規模では recursive CTE で < 100ms 応答可能
3. **一貫性**: chunks と references が同じ DB・同じトランザクションで管理され、データ不整合のリスクがない
4. **段階的拡張**: テーブル追加で将来の拡張（JSX 参照、Context 追跡等）に対応可能

### Positive Consequences

- ビルドパイプラインへの影響なし
- 既存のテスト・CI がそのまま使える
- DB マイグレーションは `CREATE TABLE IF NOT EXISTS` で安全に実行可能
- バイナリサイズ増加なし

### Negative Consequences

- 複雑なグラフクエリ（最短パス等）は SQL で表現しにくい（現時点では不要）
- 10k+ ファイル規模でのパフォーマンスは未検証（フロントエンドプロジェクトでは稀）

## Architecture Diagram

```mermaid
graph TD
    subgraph Indexing Pipeline
        TS[Source Files] --> CH[Chunker]
        CH --> |chunks| ST[Storage]
        CH --> |imports| IP[Import Parser]
        IP --> PR[Path Resolver]
        PR --> |references| ST
    end

    subgraph Storage (SQLite)
        ST --> CT[chunks table]
        ST --> VT[vec_chunks table]
        ST --> RT[references table]
        ST --> FC[file_context table]
    end

    subgraph Query
        EX[explorer tool] --> VT
        IM[impact tool] --> RT
        RT --> |recursive CTE| TD[Transitive deps]
    end
```

## Quality Attributes

| Attribute       | Priority | Approach                              |
| --------------- | -------- | ------------------------------------- |
| Simplicity      | High     | No new dependencies                   |
| Performance     | Medium   | Recursive CTE with depth limit        |
| Consistency     | High     | Same DB, same transaction             |
| Extensibility   | Medium   | New reference types via ref_kind enum |

## Trade-offs

- グラフ DB のクエリ柔軟性を犠牲にして、依存ゼロ・一貫性を優先
- 大規模グラフ性能を犠牲にして、フロントエンド規模での簡素さを優先
- 完全な TypeScript module resolution を犠牲にして、pragmatic なパス解決で十分な精度を確保

## Implementation Guidelines

1. `references` テーブルは `chunks` テーブルと同じ `replace_file_chunks` トランザクション内で更新する
2. パス解決失敗は warn ログ + スキップ（ベストエフォート）
3. recursive CTE には必ず depth 上限を設定する（デフォルト 3、最大 10）
4. スキーマバージョンを `2` に更新し、マイグレーション時は `CREATE TABLE IF NOT EXISTS` で安全に処理する

## Monitoring

- `status` ツールの出力に参照数（total references）を追加
- パス解決失敗率を tracing ログで確認可能にする
