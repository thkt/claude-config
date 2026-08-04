---
status: "proposed"
date: 2026-02-26
decision-makers: thkt
---

# ADR-0017: Build frontend-specialized code search MCP server in Rust

## Context and Problem Statement

Claude Code の組み込みツール (Grep, Glob,
Read) はテキストマッチベースであり、「認証ロジック」「状態管理パターン」のような意味的なコード検索ができない。

cocoindex-io/cocoindex-code が MCP サーバーとしてセマンティックコード検索を提供しているが：

- Python + cocoindex 依存で重い（sentence-transformers, sqlite-vec, litellm 等）
- 汎用コード検索であり、フロントエンド特有の構造（コンポーネント、hooks、ルーティング等）を意識しない
- 既存ツール群 (scout, formatter, guardrails, reviews) と技術スタックが異なる

フロントエンド開発に特化した軽量なセマンティックコード検索 MCP サーバーを Rust シングルバイナリとして構築する。

## Decision Drivers

- 既存 Rust ツール群 (scout, formatter, guardrails,
  reviews) との技術スタック統一
- 単一バイナリ配布（Python / Node.js 依存なし）
- MCP Server 起動速度 (< 100ms)
- フロントエンド特化（React, TypeScript, CSS に最適化されたチャンク分割）
- Postgres 不要（SQLite でローカル完結）

## Considered Options

### Option 1: Rust シングルバイナリ (rmcp + tree-sitter + rusqlite)

Rust で MCP Server / インデクサ / クエリエンジンを一体構築。

- Good: 既存ツール群と同じ技術スタック（Rust, Cargo, Homebrew）
- Good: 単一バイナリ、高速起動
- Good:
  tree-sitter の Rust バインディングでフロントエンド言語の AST チャンク分割
- Good: rusqlite + sqlite-vec でローカル完結（Postgres 不要）
- Good: embedding は API (OpenAI/Gemini) 経由で Python ML ライブラリ不要
- Bad: tree-sitter grammar の組み込みにビルド時間がかかる
- Bad: ONNX Runtime 統合は将来的な選択肢だが初期スコープ外

### Option 2: cocoindex-code をそのまま使う

Python の cocoindex-code を MCP サーバーとしてそのまま採用。

- Good: 既に動作する実装がある
- Good: cocoindex の増分処理エンジンを活用できる
- Bad: Python 依存（sentence-transformers, torch 等が重い）
- Bad: 起動が遅い（Python + モデルロード）
- Bad: 既存 Rust ツール群と技術スタックが分離
- Bad: フロントエンド特化のカスタマイズが困難

### Option 3: cocoindex (本体) を Rust-only に改造

本体の cocoindex から Python 層を剥がし、Rust-only で再構築。

- Good: 増分処理エンジンが成熟している
- Good: 豊富なコネクタ群を流用可能
- Bad: 不要な機能が大量（S3, GDrive, Neo4j, Qdrant, Redis 等）
- Bad: ~1,334k bytes の Rust コードから必要部分を抽出するコストが高い
- Bad: 上流追従が困難（fork メンテナンスコスト）
- Bad: ライセンス・依存関係が複雑化

## Decision Outcome

Chosen option: **Option 1 (Rust シングルバイナリ)**。

cocoindex-code の設計をリファレンスとしつつ、フロントエンド特化の軽量実装をゼロから構築する。cocoindex 本体の ~1,300k
bytes に対して ~2,000行で同等機能を実現できる見込み。既存ツール群 (claude-formatter,
claude-guardrails, claude-reviews,
scout) と同じパターンで独立リポジトリ (`yomu`) として管理する。

### Positive Consequences

- 既存ツールと同一スタック・配布フロー（Cargo, Homebrew）
- シングルバイナリ、Postgres 不要、Python 不要
- フロントエンド言語に最適化された AST ベースチャンク分割
- scout と同じ crate 群 (rmcp, reqwest) を利用（独立リポジトリ）

### Negative Consequences

- cocoindex の増分処理エンジンを使えない（初期は full rebuild）
- ローカル embedding (SentenceTransformer) は初期スコープ外
- tree-sitter grammar のバイナリサイズ増加

## Architecture

```text
┌─────────────────────────────────┐
│ MCP Server (rmcp, stdio)        │
│  tools: search, index, status   │
├─────────────────────────────────┤
│ Indexer                         │
│  walkdir + globset              │  ファイル走査
│  tree-sitter (tsx, css, etc.)   │  AST ベースチャンク分割
│  reqwest → OpenAI Embedding API │  ベクトル化
├─────────────────────────────────┤
│ Query Engine                    │
│  rusqlite + sqlite-vec          │  コサイン類似検索
├─────────────────────────────────┤
│ Storage                         │
│  .yomu/index.db (SQLite) │  ローカル完結
└─────────────────────────────────┘
```

## Scope: Frontend Specialization

### 対象ファイル

| カテゴリ         | 拡張子                                    |
| ---------------- | ----------------------------------------- |
| TypeScript/React | `*.ts`, `*.tsx`, `*.js`, `*.jsx`, `*.mjs` |
| Styles           | `*.css`, `*.scss`                         |
| Markup           | `*.html`, `*.mdx`, `*.md`                 |
| Config           | `*.json`, `*.toml`, `*.yaml`              |

### チャンク分割戦略

tree-sitter AST を利用し、フロントエンド固有の意味単位で分割：

| 単位             | 例                                          |
| ---------------- | ------------------------------------------- |
| コンポーネント   | `function Button()`, `const Card = ()`      |
| Hook             | `function useAuth()`                        |
| 型定義           | `interface Props`, `type State`             |
| CSS ルールセット | `.container { ... }`                        |
| テストケース     | `it('should render', ...)`, `describe(...)` |

汎用の `RecursiveSplitter`
(文字数ベース) ではなく、AST ノード単位で分割することでコンポーネント境界を跨がないチャンクを生成する。

## Rust Crate Dependencies

| Crate                    | 用途                 |
| ------------------------ | -------------------- |
| `rmcp`                   | MCP Server (stdio)   |
| `reqwest`                | OpenAI Embedding API |
| `serde` / `serde_json`   | 型定義               |
| `tokio`                  | async runtime        |
| `tree-sitter` + grammars | AST チャンク分割     |
| `rusqlite`               | SQLite 接続          |
| `sqlite-vec`             | ベクトル検索         |
| `walkdir`                | ファイル走査         |
| `globset`                | パターンマッチ       |

## Implementation Plan

1. `yomu` リポジトリ作成 + Cargo 初期化
2. rusqlite + sqlite-vec でストレージ層
3. walkdir + globset でファイル走査（フロントエンド拡張子フィルタ）
4. tree-sitter (TypeScript/TSX grammar) で AST チャンク分割
5. reqwest → OpenAI Embedding API でベクトル化
6. コサイン類似検索のクエリエンジン
7. rmcp で MCP Server (stdio) + ツール定義 (search, index, status)
8. `.claude/.mcp.json` 登録

## Rollback Plan

- tree-sitter の AST 分割が複雑すぎる場合：文字数ベースの RecursiveSplitter にフォールバック
- sqlite-vec に問題がある場合：usearch
  crate または brute-force 検索にフォールバック
- Rust 実装が長期化する場合：cocoindex-code を暫定利用

## Success Criteria

- [ ] MCP Server 起動時間 < 100ms
- [ ] Claude Code が search ツールを自動選択する
- [ ] TSX コンポーネント単位でチャンクが分割される
- [ ] 「認証ロジック」のような自然言語クエリで関連コードが返る
- [ ] インデックス構築が 1,000 ファイル規模で < 60秒
- [ ] シングルバイナリ配布 (`brew install`)
