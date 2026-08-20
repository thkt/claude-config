---
status: "accepted"
date: 2026-03-20
decision-makers: thkt
---

# ADR-0026: LLM指示設計における仕様-コード収束則を認識する

## Context and Problem Statement

このリポジトリ(.claude/)はLLMの振る舞いを制御する指示体系である。当初は自然言語で記述していたが、意図通りに動作しないケースが積み重なるたびに条件分岐、閾値テーブル、手続き的ステップが増加し、現在はMarkdownの皮を被ったDSLに近い状態になっている。

Gabriella Gonzalezの "A sufficiently detailed spec is code" (2026-03-17) は、OpenAI SymphonyのSPEC.mdを例に「十分に詳細な仕様書は必然的にコードに変質する」と指摘した。この指摘はLLM指示設計にもそのまま当てはまる。

実際にこのリポジトリでも、自然言語の精度限界に達した機能（lint、format、completion gate）は順次Rustバイナリに移行してきた。

## Decision Drivers

- LLM指示の精度向上を追求すると、自然言語 → 構造化Markdown → コードへの不可逆な収束が起きる
- 自然言語は曖昧さを本質的に含むため、決定的な動作保証にはコード化が必要
- 一方で、LLMは自然言語を解釈できるため、仕様-コード変換の精度問題が従来のコード生成より緩和される
- Dijkstra: 自然言語による精密さの追求は「中世スコラ学の空しい試み」に帰結する

## Considered Options

### A. 精度限界を認識し、層を使い分ける

自然言語・構造化Markdown・コードの3層を精度要件に応じて明示的に使い分ける。

- Good: 各層の強みを活かせる（自然言語=意図伝達、コード=決定的動作）
- Good: すでに行っている段階的コード化（guardrails, formatter, gates）を正当化する原則になる
- Bad: 層の境界判断に主観が入る

### B. 全てを構造化Markdownに統一する

コード化せず、Markdownの精度を上げ続ける。

- Good: 単一フォーマットで管理が容易
- Bad: 精度限界に繰り返しぶつかる（実証済み）
- Bad: Dijkstraの警告する「言語的精密さの罠」に陥る

### C. 全てをコードに移行する

指示体系を完全にプログラマブルなDSLまたはコードにする。

- Good: 決定的で検証可能
- Bad: LLMの自然言語解釈能力を活かせない
- Bad: 柔軟性と保守性が大幅に低下する

## Decision Outcome

Chosen option: A. 精度限界を認識し、層を使い分ける。

### 層の使い分け基準

| 精度要件           | 適切な層                           | 例                           |
| ------------------ | ---------------------------------- | ---------------------------- |
| 意図・方針の伝達   | 自然言語                           | CLAUDE.md, PRINCIPLES.md     |
| 手順・条件の構造化 | 構造化Markdown（テーブル・リスト） | skills/, agents/, rules/     |
| 決定的な動作保証   | コード（Rust, shell）              | guardrails, formatter, gates |

### 移行の判断基準

自然言語/Markdownからコードへの移行は以下のいずれかに該当する場合:

- LLMが同じ指示を繰り返し無視・誤解する
- 偽陰性/偽陽性が許容できない（lint, security）
- 実行速度がクリティカル

### Positive Consequences

- 「なぜこれはMarkdownでなくRustなのか」の判断根拠が明文化される
- 自然言語の強み（柔軟な意図伝達）を不必要にコード化しない歯止めになる

### Negative Consequences

- 層の境界判断は依然として主観的。経験則に依存する

## Reassessment Triggers

- 層の境界を経験則でなく判定できる基準が見つかったとき
- 自然言語指示の精度が上がり、コード化しないと保証できない範囲が狭まったとき
