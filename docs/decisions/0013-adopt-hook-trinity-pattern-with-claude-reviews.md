---
status: "accepted"
---

# ADR-0013: Hook Trinity パターンの採用 - claude-reviews による Pre-flight 分析の確実な実行

## Context and Problem Statement

audit の pre-flight 分析（knip, react-doctor 等）は `commands/audit.md` の Step 2.5 に AI への指示として記載されている。AI が手順を飛ばす可能性があり、実行が保証されない。

一方、ファイル単位の品質保証は既に hook で確実に動作している:

- **guardrails**: PreToolUse(Write|Edit) - ファイル書き込み前のゲート
- **formatter**: PostToolUse(Write|Edit) - ファイル書き込み後の整形

プロジェクト全体の分析には同等の確実性がない。

## Decision Drivers

- AI の手順スキップリスク: audit.md の指示は非決定的
- guardrails/formatter で確立された Rust CLI + hook パターンの実績
- プロジェクト全体の静的解析ツール（knip, oxlint, tsgo, react-doctor）の充実
- tsgo の stable リリース（TypeScript 7.0, 2026-01）により高速な型チェックが利用可能

## Considered Options

- Option A: Hook Trinity（Rust CLI バイナリ）
- Option B: シェルスクリプト hook
- Option C: audit.md 内の手順強化

### Option A: Hook Trinity（Rust CLI バイナリ）

新規 Rust CLI ツール `claude-reviews` を作成。PreToolUse(Skill) hook として `/audit` 実行時に自動でプロジェクト全体分析を行い、結果を `additionalContext` で注入。

### Option B: シェルスクリプト hook

既存の `hooks/audit/preflight.sh` をそのまま使用。

### Option C: audit.md 内の手順強化

Step 2.5 の指示をより強い表現（MUST, REQUIRED 等）に変更。

## Decision Outcome

**Option A: Hook Trinity** を採用。

```text
guardrails  → PreToolUse(Write|Edit)  → ファイル単位のゲート
formatter   → PostToolUse(Write|Edit) → ファイル単位の整形
reviews     → PreToolUse(Skill)       → プロジェクト全体の分析
```

### 構成ツール

| Tool         | Purpose                            | Condition          |
| ------------ | ---------------------------------- | ------------------ |
| knip         | 未使用ファイル/依存/export         | package.json 存在  |
| oxlint       | プロジェクト全体 lint + react-perf | oxlint 存在        |
| tsgo         | 型チェック（高速）                 | tsconfig.json 存在 |
| react-doctor | React 健全性                       | React 依存存在     |

### 設計原則

- **Fail-open**: ツール未検出・実行失敗でも exit 0（audit をブロックしない）
- **並列実行**: 4ツールを `std::thread` で並列（timeout 制約対応）
- **Raw テキスト出力**: ツール出力をそのまま渡す（JSON パースしない。fragile なパース層を避ける）
- **CLI サニタイズ**: ANSI エスケープ・連続空行を除去（全ツール共通）
- **プロジェクト設定**: `.claude-reviews.json` でツール個別の有効/無効

## Consequences

### Positive

- プロジェクト全体分析が確実に実行される（AI の手順スキップリスク排除）
- guardrails/formatter と一貫したパターン（Rust CLI, Homebrew, プロジェクト設定）
- audit エージェントが分析結果をコンテキストとして受け取れる
- ツール追加が容易（新しい `tools/*.rs` を追加するだけ）

### Negative

- 新規 Rust プロジェクトのビルド・配布コスト
- 4つのランタイム依存（knip, oxlint, tsgo, npx）のインストールが前提
- hook timeout (45s) 内に全ツール完了する必要がある

### Neutral

- audit.md の Pre-flight セクションは hook 提供結果の参照に簡略化
- 暫定 preflight.sh は削除済み。claude-reviews バイナリで置き換え予定

## References

- SOW (`../workspace/planning/2026-02-22-claude-reviews/sow.md`) (local planning artifact, not committed)
- Spec (`../workspace/planning/2026-02-22-claude-reviews/spec.md`) (local planning artifact, not committed)
- ADR-0006: 決定論的処理のスクリプト化パターン
- ADR-0009: IDR 生成の外部リポジトリ化（Rust）, 同様の Rust 外部化パターン

## Reassessment Triggers

- 3 hook のいずれかが、外部ツールの配布形態の変更で使えなくなったとき
- pre-flight 分析を hook でなく skill 側で確実に起動できる仕組みが出たとき
