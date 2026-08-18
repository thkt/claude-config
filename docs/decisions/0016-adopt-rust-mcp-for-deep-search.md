---
status: "proposed"
date: 2026-02-25
decision-makers: thkt
---

# ADR-0016: Adopt Rust + rmcp for deep-search MCP Server

## Context and Problem Statement

Claude Code の組み込みツールに以下の課題がある：

- **WebSearch**: 単発検索のみ。深掘り・横断検索・日本語精度に課題
- **WebFetch**: 全リクエストで LLM
  round-trip。生 Markdown だけ欲しい場面で遅く高コスト

Gemini API の Grounding with Google
Search で高品質な検索を、ローカル Readability +
HTML→Markdown 変換（readmd 計画を統合）で高速・無料のページ取得を提供する。ページ内容の分析は Claude
Code 自身が行うため、Gemini の URL Context による AI 分析は不要と判断。

MCP Server として実装することで、Claude
Code が自動的にツールを選択・使用できる（WebSearch と同じ発火モデル）。

## Decision Drivers

- Claude Code からの自動呼び出し（MCP ツールは組み込みツールと同等の扱い）
- 既存ツール (formatter, guardrails, reviews) との技術スタック統一
- 単一バイナリ配布による運用シンプルさ
- 起動速度（MCP Server は Claude Code セッション毎に起動される）

## Considered Options

### Option 1: Full Rust (rmcp + reqwest)

単一 Rust バイナリで MCP Server + Gemini REST API クライアントを実装。

- Good: 既存ツールと統一（Rust, Cargo, Homebrew）
- Good: 単一バイナリ、高速起動 (< 100ms)
- Good: Node.js 不要
- Good: rmcp は
  [公式 Rust SDK](https://github.com/modelcontextprotocol/rust-sdk)
- Bad: Gemini SDK が公式にない（REST API 直叩き）
- Bad: API 型定義を自前で書く必要あり

### Option 2: Rust CLI + TypeScript MCP wrapper

Rust で検索ロジック、TypeScript (@modelcontextprotocol/sdk) で MCP 層。

- Good: MCP 層は公式 TS SDK で安定
- Good: Gemini TS SDK (@google/generative-ai) も使える
- Bad: 2 パッケージ管理 (Cargo + npm)
- Bad: Node.js 依存が追加される
- Bad: プロセス起動コスト（Node.js + 子プロセス spawn）

### Option 3: Full TypeScript

TypeScript で全て実装。@google/generative-ai + @modelcontextprotocol/sdk。

- Good: 公式 SDK が両方使える
- Good: 実装最速
- Bad: 既存ツールと統一感なし（全て Rust）
- Bad: 起動が遅い（Node.js 起動コスト）
- Bad: 単一バイナリ配布が困難

## Decision Outcome

Chosen option: **Option 1 (Full
Rust)**。既存ツールとの統一性、単一バイナリの運用性、起動速度が決め手。

Gemini REST API は素直な JSON なので、reqwest + serde で十分対応できる。公式 TS
SDK のメリット（型定義の自動生成）は、API が安定していることを考えると管理コスト増に見合わない。

### Positive Consequences

- 既存ツール (formatter, guardrails, reviews) と同じ技術スタック・配布フロー
- 単一バイナリで `brew install` 一発
- MCP Server 起動 < 100ms（Node.js 起動コストなし）
- Node.js 依存なし

### Negative Consequences

- Gemini API の型定義を自前メンテ（API 変更時に手動更新）
- Rust の非同期 HTTP 処理は TS より記述量が多い

## Implementation Plan

1. `cargo init deep-search` + 依存追加 (rmcp, reqwest, serde, tokio,
   dom_smoothie, fast_html2md)
2. Gemini REST API 型定義 + クライアント実装
3. Fetch エンジン: reqwest + dom_smoothie + fast_html2md（readmd 計画を統合）
4. rmcp で MCP Server (stdio) + ツール定義 (search, fetch, research)
5. Homebrew formula 作成 + `.claude/.mcp.json` 登録

## Rollback Plan

rmcp crate に重大な問題が発覚した場合：

- Option 2 (Rust CLI + TS MCP wrapper) にフォールバック
- Rust の検索ロジックはそのまま流用可能、MCP 層のみ TS に差し替え

## Success Criteria

- [ ] Claude Code が deep-search ツールを自動で選択・使用する
- [ ] search ツールが WebSearch より詳細なソース付き回答を返す
- [ ] fetch ツールが WebFetch より高速（LLM 不使用）かつ高精度な Markdown を返す
- [ ] research ツールで検索→fetch→統合の一連フローが動作する
- [ ] research の Gemini API 呼出が ≤ 2回（search + 統合）に収まる
- [ ] MCP Server 起動時間 < 100ms

## Reassessment Triggers

- Gemini API の型定義変更が続き、自前メンテのコストが公式 SDK 採用を上回ったとき
- MCP Server の起動速度が問題にならない実行形態へ移ったとき
