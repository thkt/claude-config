---
status: "proposed"
date: 2026-03-03
decision-makers: thkt
---

# ADR-0021: Build Slack conversation semantic search MCP server (kiku)

## Context and Problem Statement

チームの Slack 会話にはドメイン固有の用語（ユビキタス言語）やその定義が自然発生的に蓄積されるが、ユーザーはその用語を事前に知らない。「このチャンネルで独特な使われ方をしている用語」を発見し、その意味を理解したい。

Slack の search.messages
API はキーワード前提であり、「キーワードを知らない状態での概念発見」はできない。yomu
(ADR-0017) がフロントエンドコードに対して提供する semantic
search と同等の能力を、Slack 会話に対して提供する必要がある。

## Decision Drivers

- ユビキタス言語の自動発見にはセマンティック検索が必須（キーワード検索では不可）
- yomu で実証済みのアーキテクチャ (SQLite + sqlite-vec + Gemini
  embedding) を活用
- 既存 Rust ツール群 (yomu, scout, formatter, guardrails) との技術スタック統一
- LLM 生成処理（用語抽出）は MCP サーバーの責務外とし、既存 `/glossary`
  スキルに委譲する設計
- Slack API の特性（rate limit, pagination, 動的データ）への適切な対応

## Considered Options

### Option 1: kiku - yomu コピーフォークによる独立 Rust MCP server

yomu のアーキテクチャをコピーフォークし、データソースを Slack
API に置換。embedding-only 検索、thread ベースチャンク、遅延 embedding。

- Good: yomu で実証済みの embedding + sqlite-vec パターンを再利用
- Good: 独立リポジトリで yomu に影響なし
- Good: キーワード不要の概念発見が可能
- Good: `/glossary` スキルとの責務分離が明確
- Bad: Slack API の rate limit で harvest に時間がかかる（FS walk の数十倍）
- Bad: 日本語会話に対する Gemini embedding の精度が未検証
- Bad: 新規リポジトリのメンテナンスコスト

### Option 2: /glossary スキルのみ（Slack search API + LLM 直接処理）

ローカルインデックスを持たず、Slack の search.messages
API で会話を取得し、LLM で直接用語抽出する。

- Good: 実装コストが最小（スキル改修のみ）
- Good: 常に最新のデータにアクセス（同期不要）
- Good: コンプライアンスリスクなし（ローカルにデータ保存しない）
- Bad: **キーワード前提の検索であり、未知の用語を発見できない**（致命的）
- Bad: 大量会話の LLM 処理でコンテキスト枠を消費
- Bad: 概念的なクラスタリングや重み付けができない

### Option 3: yomu を拡張してマルチソース対応にする

yomu にプラグインアーキテクチャを導入し、FS ソースに加えて Slack ソースを追加。

- Good: 単一ツールで管理（リポジトリ増えない）
- Good: 共有コードの重複なし
- Bad: yomu の責務が肥大化（フロントエンドコード検索から汎用検索へ）
- Bad: walker, chunker, storage 全てに抽象化レイヤーが必要
- Bad: Slack 固有要件 (rate limit, sync state, token 管理) が yomu を汚染
- Bad: yomu の安定版に影響を与えるリスク

## Decision Outcome

Chosen option: **Option 1 (kiku)**,
because ユビキタス言語の自動発見というコア要件が embedding ベースのセマンティック検索を必須とし、Slack
API の特性は yomu とは根本的に異なるため独立ツールが適切。

### Key Design Decisions

| Decision             | Choice                | Rationale                                       |
| -------------------- | --------------------- | ----------------------------------------------- |
| 共有コード戦略       | コピーフォーク        | 独立進化を許容。Cargo workspace は時期尚早      |
| 検索方式             | embedding-only        | 日本語に FTS5 は不適。概念発見がコア要件        |
| チャンク単位         | thread / message      | 時間窓は意味境界にならない (DA review C5)       |
| embedding タイミング | search 時に遅延       | harvest の MCP タイムアウト回避 (DA review)     |
| glossary 生成        | kiku 外（スキル）     | LLM 処理は MCP サーバーの責務外 (DA review C2)  |
| DB 配置              | $XDG_DATA_HOME/kiku/  | プロジェクト外でセキュリティ確保 (DA review C4) |
| Token                | bot token (xoxb) 推奨 | スコープ制限可能。xoxp もフォールバック対応     |

### Positive Consequences

- キーワードを知らない状態でドメイン用語を自動発見できる
- yomu と同じ技術スタック・アーキテクチャで保守性が高い
- `/glossary` スキルとの責務分離により、各コンポーネントが単純に保たれる
- 将来的に Slack 以外のソース (Notion,
  Confluence 等) への展開も独立ツールとして同パターンで構築可能

### Negative Consequences

- コピーフォークした embedder.rs / storage の乖離リスク
- 日本語会話に対する embedding 品質の検証が必要 (v0.2 で対応)
- Slack API rate limit による harvest の遅延（FS walk 比で数十倍）

## Implementation Plan

| Phase | Scope                                          | 検証                 |
| ----- | ---------------------------------------------- | -------------------- |
| v0.1a | fetcher + chunker + storage + harvest + status | Slack 取得 → DB 格納 |
| v0.1b | embedder + search                              | semantic search 動作 |
| v0.2  | embedding 品質検証                             | 50会話 × 10クエリ    |
| v0.3  | /glossary スキル連携                           | E2E 用語発見         |
| v1.0  | 安定版                                         | ドキュメント整備     |

## Rollback Plan

kiku を廃止した場合、`/glossary` スキルは既存の Slack search
API フォールバックで動作し続ける（概念発見は不可だが、キーワード指定の用語検索は可能）。

## Success Criteria

- v0.2: 実データ 50会話 × 10クエリで top-5 に関連会話が含まれる
- v0.3: `/glossary` 経由で実プロジェクトのドメイン用語を5つ以上自動発見できる

## References

- ADR-0016: Adopt Rust MCP for deep search
- ADR-0017: Build frontend code search MCP (yomu)
- DA review: .claude/workspace/planning/2026-03-03-kiku/plan.md
- SOW/Spec: .claude/workspace/planning/2026-03-03-kiku/sow.md, spec.md

## Reassessment Triggers

- コピーフォークした embedder.rs と storage が yomu と乖離し、同じ修正を 2 回入れる事態が続いたとき
- 日本語会話の embedding 品質が実測で足りず、用語発見に使えなくなったとき
