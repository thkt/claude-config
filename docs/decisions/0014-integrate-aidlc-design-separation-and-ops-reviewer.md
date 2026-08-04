---
status: "accepted"
---

# ADR-0014: AI-DLC 統合 - 設計分離と Operational Readiness Reviewer

## Context and Problem Statement

AI-DLC（AI-Driven Development Lifecycle）は AWS が提唱する AI ネイティブ開発方法論。現行ワークフローに以下の課題がある:

1. `/think` Step 4（Design Composition）でビジネスロジック（What）と技術設計（How）が混在し、ドメイン理解が浅いまま実装に進むことがある
2. 運用観点（Error Boundary, Logging, Performance Budget）の検査が体系化されていない
3. Spec テンプレートの Data Model がフラットで、ビジネスルールやドメインイベントを記述する構造がない

AI-DLC の Construction Phase では Functional Design（ビジネスロジック、技術非依存）→ NFR Design（パターン適用）→ Code Generation と段階を分けている。この分離の概念を取り入れたい。

## Decision Drivers

- Occam's Razor: Step 数・Phase 数を増やさない（Miller's Law 7±2）
- ADR-0012 の教訓: AI はステップが増えると飛ばす・順序を誤る
- 既存パターンの活用: reviewer パターン（ADR-0011, 0012）
- 汎用性: 個人開発だけでなくビジネスアプリ開発にも対応

## Considered Options

- Option A: Step 分離（Step 5a/5b 新設）
- Option B: Step 4 サブセクション化
- Option C: /feature Phase 6 追加
- Option D: /audit reviewer 追加

### Option A: Step 分離（Step 5a/5b 新設）

/think に Step 5a（Domain Design）と Step 5b（Logical Design）を新設。Step 数が 10 → 12 に増加。

### Option B: Step 4 サブセクション化

/think Step 4（Design Composition）内に Domain Perspective / Technical Perspective のサブセクションを追加。Step 数は据え置き。

### Option C: /feature Phase 6 追加

Operational Readiness を /feature の Phase 6 として独立追加。

### Option D: /audit reviewer 追加

reviewer-operations を作成し、既存の /audit Phase 4 でカバー。

## Decision Outcome

**Option B + D** を採用。

| 変更     | 方法                       | 根拠                                 |
| -------- | -------------------------- | ------------------------------------ |
| 設計分離 | Step 4 サブセクション（B） | Step 数据え置き、Miller's Law 準拠   |
| 運用観点 | /audit reviewer 追加（D）  | 既存 tier-based audit パターンに適合 |

### Devil's Advocate レビュー結果

7 件の指摘を受け、以下を反映:

| 指摘                                                 | 対応                                   |
| ---------------------------------------------------- | -------------------------------------- |
| Step 膨張（critical）                                | Option A を棄却、B を採用              |
| Domain Design がフロントエンドに不適合（high）       | 汎用設定であり棄却。ただし発動条件付き |
| Unit Assessment 閾値が PRE_TASK_CHECK と重複（high） | 新閾値不要、既存を再利用               |
| Ops が個人開発に過剰（high）                         | 汎用設定であり棄却                     |
| SOW 役割逸脱（medium）                               | SOW にセクション追加せず、AC で吸収    |
| Spec テンプレート形骸化（medium）                    | 「該当しない場合は省略」指示で対応     |
| 導入順序未定義（medium）                             | Phase 1-4 の段階的実装を定義           |

## Consequences

### Positive

- /think の設計品質向上: ドメイン理解 → 技術選定の順序が明確化
- 運用観点の体系的カバー: Error Boundary, Loading, Logging, Performance
- Step 数・Phase 数据え置き: 既存ワークフローとの互換性維持
- Spec テンプレートがビジネスアプリ開発にも対応

### Negative

- Step 4 のサブセクションは AI が無視する可能性がある（→ 具体的な出力テンプレートで緩和）
- reviewer 1 つ追加で /audit の実行時間が微増（Large tier のみ）

### Neutral

- /feature の Phase 構造は変更なし
- SOW テンプレートは変更なし
- PRE_TASK_CHECK は変更なし

## References

- [AI-DLC Method Definition](https://prod.d13rzhkk8cj2z0.amplifyapp.com/) (Amplify URL - may change; use GitHub repos as stable reference)
- [awslabs/aidlc-workflows](https://github.com/awslabs/aidlc-workflows)
- [ikeisuke/ai-dlc-starter-kit](https://github.com/ikeisuke/ai-dlc-starter-kit)
- [SOW](../workspace/planning/2026-02-22-aidlc-integration/sow.md) (local planning artifact, not committed)
- [Spec](../workspace/planning/2026-02-22-aidlc-integration/spec.md) (local planning artifact, not committed)
