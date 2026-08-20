---
status: "proposed"
date: 2026-03-20
scope: [ts, testing]
---

# ADR 0028: oxc_parser によるテスト品質ゲート litmus の構築

## Context and Problem Statement

LLMによるテスト生成が日常化し、対症療法的なテスト（弱assertion、mock過多、横断重複）がテストスイートに混入する問題が顕在化している。

現状の課題:

- `@vitest/eslint-plugin` は1ファイルスコープの基本ルールのみ（`no-identical-title`, `expect-expect`）
- テスト間の横断比較を行うツールは存在しない
- Stryker（mutation testing）は検出力が高いが実行コストが重い（CI定期実行向き）
- プロンプト強化だけでは生成元ごとにバラつく

## Decision Outcome

oxc_parserベースの独立Rustバイナリ `litmus` を新規構築し、gatesから外部コマンドとして呼び出す。

## Considered Options

- A: gates 内蔵 (oxc_parser を gates の Cargo 依存に追加)
- B: 独立バイナリ (新規 tap バイナリ、gates から GateDefinition で呼び出し)
- C: ESLint カスタムルール

### 検討したアプローチ

| アプローチ               | 概要                                                              | 判定 |
| ------------------------ | ----------------------------------------------------------------- | ---- |
| A: gates 内蔵            | oxc_parser を gates の Cargo 依存に追加。内部モジュールとして実装 | 却下 |
| B: 独立バイナリ          | 新規 tap バイナリ。gates から GateDefinition で呼び出し           | 採用 |
| C: ESLint カスタムルール | 1ファイルスコープのルールは ESLint で対応                         | 却下 |

### Approach A 却下理由

- gatesの責務「外部コマンドの並列実行」が「AST分析」に拡大する
- oxc_parser依存でコンパイル時間・バイナリサイズ増
- テスト品質ルールのイテレーションがgatesリリースサイクルに結合

### Approach C 却下理由

- 1ファイルスコープでは横断比較（本ツールの存在意義）ができない
- oxlintのJS Pluginは2026 Q1 Alphaでまだ不安定
- Phase 1の弱assertion/mock過多はESLintでも可能だが、横断比較前提のアーキテクチャで統一するほうが一貫性がある

### Approach B 採用理由

- gatesの設計哲学（外部コマンド型）を維持
- 独立開発・バージョン管理が可能
- CLI単体利用可能（CI/pre-commitでも使える）
- tapの既存ツール（guardrails/formatter/reviews/gates）と同じパターン

## 検出ルール

| Phase | ルール             | スコープ  | 検出内容                                     |
| ----- | ------------------ | --------- | -------------------------------------------- |
| 1     | weak-assertion     | 1ファイル | toBeTruthy/toBeDefined のみのテストブロック  |
| 1     | mock-overuse       | 1ファイル | mock数 > assertion数のテストブロック         |
| 3     | duplicate-coverage | 横断      | 同一モジュール×同一メソッドへの重複assertion |

## 技術スタック

- oxc_parser / oxc_ast: JS/TS ASTパース
- Vitest + Bun test: 対象テストフレームワーク（`test`/`it`/`describe`/`expect` 共通パターン）
- gates統合: `{"gates": {"litmus": true}}` で有効化。gates configはHashMap汎用化済みのため、gates側の変更はGateDefinition追加のみ

## Consequences

### 良い結果

- テスト品質の機械的担保。人やプロンプトに依存しないガードレール
- 横断重複検出は既存ツールにない独自の価値
- tapエコシステムの拡張として自然に統合
- oxc_parserの高速パースにより、全スキャンでもパフォーマンス問題なし

### 悪い結果

- tapに新バイナリ追加（管理コスト増）
- oxc_parserのAPI変更に追従が必要
- 横断重複の「類似度」定義が設計上の難所。false positiveリスクあり

### リスク軽減

- Phase 1（1ファイルスコープ）でWalking Skeletonを構築し、横断比較はPhase 3で追加
- false positiveリスクはadvisoryモード運用で検証後にblockへ移行

## References

- SOW/Spec: `.claude/workspace/planning/2026-03-20-test-quality/`
- gates: `~/GitHub/gates/`
- ADR-0013: Hook Trinityパターン（guardrails/formatter/reviews + gates）

## Reassessment Triggers

- oxc_parser の API 変更に追随するコストが、既存 linter へ相乗りするコストを上回ったとき
- gates から外部コマンドとして呼ぶ形が、実行時間の面で成立しなくなったとき
