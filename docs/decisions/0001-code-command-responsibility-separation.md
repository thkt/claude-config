---
status: "accepted"
date: 2025-12-16
---

# ADR 0001: code.md コマンドの責任分離

> Note (2026-04-24): `generating-tdd-tests` → `tdd-cycle` (2026-04-23) → `use-workflow-tdd-cycle` (2026-04-24) に順次改名。本 ADR は履歴保持のため原名を維持。

## 実装進捗

- [x] Phase 1: 検証 - references/commands/code/ ディレクトリ作成
- [x] Phase 2: 高優先度分離 - test-preparation.md, storybook.md 抽出
- [x] Phase 3: 完全分離 - rgrc-cycle.md, quality-gates.md, completion.md 抽出
- [x] Phase 4: ドキュメント更新 - COMMANDS.md、日本語同期完了 (2025-12-16)

### 実装メモ

`principles.md`は個別ファイルとして作成されませんでした。代わりに、既存のスキルを参照しています：

- `@~/.claude/skills/applying-code-principles/SKILL.md`
- `@~/.claude/skills/generating-tdd-tests/SKILL.md`

この決定は、コンテンツの重複を避けて既存のアセットを再利用するDRY原則に従っています。

## Context and Problem Statement

`/code` コマンド（`~/.claude/commands/code.md`）は現在906行、10以上の責任を持ち、Miller's Law（7±2）に違反している。

### 現状の責任（調査結果）

| #   | 責任           | 行数 | セクション                 |
| --- | -------------- | ---- | -------------------------- |
| 1   | spec.md 管理   | 26   | Specification Context      |
| 2   | Storybook 統合 | 73   | Storybook Integration      |
| 3   | スキル参照     | 10   | Integration with Skills    |
| 4   | 実装原則説明   | 305  | Implementation Principles  |
| 5   | テスト準備     | 143  | Test Preparation (Phase 0) |
| 6   | RGRC サイクル  | 120  | TDD Cycle                  |
| 7   | 進捗表示       | 89   | Progress Display           |
| 8   | 品質チェック   | 56   | Quality Check Results      |
| 9   | リスク軽減     | 34   | Risk Mitigation            |
| 10  | 完了定義       | 53   | Definition of Done         |

### 問題点

- **Miller's Law 違反**: 10+の責任は認知限界（7±2）を超過
- **保守性低下**: 変更時の影響範囲が広い
- **テスト困難**: 単一ファイルで複数の機能をテストする必要
- **理解困難**: 新規開発者が全体像を把握しにくい

## Decision Drivers

1. **単一責任原則（SRP）への準拠** - 各コマンドは一つの責任のみを持つべき
2. **Miller's Law（7±2）の遵守** - 認知負荷を軽減
3. **保守性の向上** - 変更の影響範囲を限定
4. **テスト可能性の向上** - 個別機能のテストを容易に
5. **ユーザー体験の維持** - 既存のワークフローを破壊しない

## Considered Options

### オプション A: 現状維持（一枚岩）

**説明**: 変更なし、現在の構造を維持

**メリット**:

- 変更コストゼロ
- 既存の動作を破壊しない
- 学習コストなし

**デメリット**:

- Miller's Law 違反が継続
- 保守性が低下し続ける
- 新機能追加がさらに複雑化
- テスト困難

### オプション B: 参照ベースのモジュール化（選択）

**説明**: 責任を個別ファイルに分離し、メインコマンドから参照

**メリット**:

- Miller's Law 準拠（責任を7±2以内に）
- 保守性向上（変更の影響範囲が限定）
- 既存スキルを再利用（DRY原則）
- ユーザー体験維持（コマンドインターフェース変更なし）

**デメリット**:

- 初期実装コスト
- ファイル数増加
- 参照管理が必要

### オプション C: 完全分離（複数コマンド）

**説明**: `/code` を複数の小さなコマンドに分割

**メリット**:

- 最大限の単一責任
- 個別テストが容易

**デメリット**:

- ユーザー体験の破壊（ワークフロー変更）
- 学習コスト大
- 既存ドキュメントの大幅更新必要

## Decision Outcome

**選択されたオプション**: オプション B（参照ベースのモジュール化）

### 理由

1. **ユーザー体験維持**: 既存の `/code` ワークフローを変更しない
2. **DRY原則遵守**: 既存スキルを再利用し、コンテンツ重複を回避
3. **段階的実装**: 4フェーズに分けて安全に移行
4. **Miller's Law 準拠**: 責任を6モジュールに分離（7±2以内）

### 実装構造

```text
commands/
└── code.md (89行、薄いラッパー)

references/commands/code/
├── spec-context.md
├── storybook.md
├── test-preparation.md
├── rgrc-cycle.md
├── quality-gates.md
└── completion.md
```

## Consequences

### ポジティブ

- ✅ Miller's Law 準拠（10責任 → 6モジュール）
- ✅ 保守性向上（個別ファイルの変更が容易）
- ✅ DRY原則遵守（既存スキルを再利用）
- ✅ ユーザー体験維持（コマンドインターフェース変更なし）

### ネガティブ

- ⚠️ ファイル数増加（1 → 7ファイル）
- ⚠️ 参照管理のオーバーヘッド
- ⚠️ EN/JA同期の維持が必要

## References

- [ADR 0002](./0002-fix-modularization-and-tdd-commonization.md) - 同様のパターンを `/fix` に適用
- Miller's Law (`../../skills/applying-code-principles/SKILL.md`) - 認知負荷原則
- [COMMANDS.md](../COMMANDS.md) - コマンドドキュメント

---

_作成日: 2025-12-16_
_著者: Claude Code_
_ステータス: 承認済み_

## Reassessment Triggers

- 1 コマンドが担う責任が 2 つ以上に増え、参照先を開かないと動作を追えなくなったとき
- 参照ベースの分割が原因で、同じ指示を複数ファイルへ書き写す必要が出たとき
