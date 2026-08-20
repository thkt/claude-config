---
status: "accepted"
---

# ADR-0020: kagami - 技術スタックと収集方式の選定

## Date

2026-02-28

## Context and Problem Statement

チーム30名の Claude
Code 活用状況を可視化するダッシュボードを新規構築する。データ収集方式と技術スタックの選定が必要。

参考事例: [ダイニー社の事例](https://zenn.dev/dinii/articles/28c8fcd041837d)
（BigQuery + カスタムWebアプリ構成）

### 要件

- 30名規模のチームが利用
- Skill / Subagent / MCP / BuiltIn ツールの利用状況を可視化
- トークン消費量・コスト分析
- AI によるトレンド分析
- 低コスト運用（可能な限り無料枠内）

## Considered Options

- データ収集: Stop hook で JSONL 解析 (採用) / Hook 経由で直接送信 / 別エージェントで polling
- 技術スタック: Cloudflare 統一 (採用) / Vercel + Supabase / 自前 VPS
- 配布方式: Plugin Marketplace (採用) / settings.json 手動編集 / 専用 CLI installer

## Decision Outcome

### 決定1: データ収集 - トランスクリプト JSONL 解析

**選択**: Stop hook でセッション終了時にトランスクリプト JSONL を解析

**不採用**:

| 候補                 | 不採用理由                                                 |
| -------------------- | ---------------------------------------------------------- |
| OpenTelemetry        | 「Claude Code を使った」レベルまで。個別ツール特定不可     |
| PostToolUse hook     | イベント単位で発火。セッション全体の文脈・トークン集計不可 |
| ファイル直接読み取り | 分散チームでは不可能                                       |

**根拠**: JSONL にはすべての tool_use イベント（name,
input）、モデル名、トークン使用量（input/output/cache）が含まれる。セッション終了時に一括解析することでデータの整合性と網羅性を確保できる。

### 決定2: 技術スタック - Cloudflare 統一

| Layer    | Choice                                | Rationale                              |
| -------- | ------------------------------------- | -------------------------------------- |
| Frontend | TanStack Router (SPA) + CF Pages      | SSR不要、stable版でリスク低減          |
| API      | Hono + @hono/zod-openapi + CF Workers | 型安全API、Edge実行、okr-dashboard実績 |
| Auth     | Clerk + @hono/clerk-auth              | GitHub OAuth簡単、30人は無料枠内       |
| ORM      | Drizzle                               | 型安全、D1対応、okr-dashboard実績      |
| DB       | Cloudflare D1 (SQLite)                | Workers Binding でゼロレイテンシ       |
| Styling  | Panda CSS + Ark UI + Park UI          | 型安全CSS、アクセシブルUI              |
| Runtime  | bun (local) / workerd (prod)          | 高速、CF Workers互換                   |

**不採用**:

| 候補                 | 不採用理由                                      |
| -------------------- | ----------------------------------------------- |
| TanStack Start (RC)  | RC段階でbreaking changes リスク                 |
| Next.js + Vercel     | Cloudflare統一の方がシンプル                    |
| Neon (Serverless PG) | D1の方が低コスト、Workers Binding で高速        |
| Turso (SQLite)       | D1の方がCF統一で管理楽、追加サービス不要        |
| Supabase             | 機能過多（Realtime, Storage等不要）             |
| drizzle-zod          | API入力バリデーションは hono/zod-openapi で十分 |

### 決定3: 配布方式 - Plugin Marketplace

**選択**: Private GitHub repo → `/plugin marketplace add` でインストール

**根拠**: 設定ファイル編集不要、「このコマンドを打って」で案内完了。ダイニー社でも同方式で全員導入達成。

## Consequences

### Positive

- Cloudflare 統一でインフラ管理コスト最小
- D1 Binding でネットワーク越えない API アクセス
- 30人規模なら全サービス無料枠内で運用可能
- okr-dashboard と同パターンで学習コスト低
- トランスクリプト解析で最も詳細なデータ取得可能

### Negative

- D1 は SQLite のため Postgres 固有機能（JSONB, recursive CTE）使えない
- TanStack
  Router は SPA のため初期 JS バンドルが大きい（ダッシュボードなので許容）
- Stop hook 非発火時（クラッシュ等）のデータ欠損 → backfill CLI で補完
- Claude Code の JSONL フォーマット変更リスク → version フィールドで分岐対応

### Neutral

- Plugin のユーザースコープ配置が必要（モノレポ対応のため）
- Clerk の GitHub OAuth 設定が初期セットアップで必要

## Reassessment Triggers

- トランスクリプト JSONL の形式が変わり、Stop hook の解析が壊れたとき
- Cloudflare 以外のホスティングを要する要件が出たとき
