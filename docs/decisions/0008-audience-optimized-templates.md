---
status: "accepted"
---

# ADR-0008: 読み手別テンプレート最適化の採用

## Context and Problem Statement

SOW/Spec/ADR の3文書はそれぞれ異なる読み手と目的を持つ：

| 文書 | 問い            | 読み手                       | 寿命           |
| ---- | --------------- | ---------------------------- | -------------- |
| SOW  | What/Why        | AI（構造化データとして解析） | タスク完了まで |
| Spec | How             | AI（実装入力として解析）     | タスク完了まで |
| ADR  | Why this choice | 人間（将来の開発者が参照）   | 半永久的       |

しかし、3文書のテンプレートはすべて同じ「`{variable}` プレースホルダ羅列」形式で作成されていた。

### 課題

1. **SOW テンプレートと実態の乖離**: 24本の SOW がすべてテンプレートの構造を無視して書かれていた。テンプレートの ID 体系（I-001, A-001, AC-001, R-001 の4種）は一度も使われず、実態では `AC-1` の簡素な連番のみ使用。
2. **ADR テンプレートが人間向けでない**: プレースホルダを AI が埋める構造だったが、実際の ADR は散文スタイルで書かれており、テンプレートは実質的に無視されていた。
3. **SOW/Spec の境界が曖昧**: 両文書に Test Plan と Assumptions が重複して存在。
4. **reviewer-spec の不整合**: テンプレートに存在しない `API Spec` セクションを必須として要求。

## Decision Drivers

- AI 読み手には構造化テーブル（機械的に検証可能なフォーマット）が最適
- 人間読み手には散文・ガイドライン・例示（文脈と判断の理由が伝わるフォーマット）が最適
- 24本の SOW が一貫してテンプレートを無視している事実はテンプレート側の問題を示す
- ADR-0005 で「対象読者による役割分離」の原則が既に確立済み

## Considered Options

### 読み手別最適化（採用）

SOW/Spec のテンプレートは構造化テーブル形式を維持しつつ実態に合わせて簡素化。ADR テンプレートはガイドライン+例示形式に変更。

- Good: 各文書の読み手に最適なフォーマットを提供
- Good: テンプレートと実態の乖離を解消（テンプレートが実際に使われる）
- Good: ADR-0005 の設計原則と一貫
- Bad: テンプレート間のフォーマット統一感が低下

### 全テンプレートをプレースホルダ統一形式に維持

現状のフォーマットを維持し、AI に徹底させる。

- Good: テンプレート間の一貫性
- Bad: 24本の SOW 実態と矛盾し続ける
- Bad: ADR が人間にとって読みにくいまま

### 全テンプレートをガイドライン形式に変更

SOW/Spec もガイドライン形式にする。

- Good: フォーマットの統一感
- Bad: AI が構造化データとして解析しにくくなる
- Bad: `/validate` での機械的検証が困難に

## Decision Outcome

読み手別最適化を採用。具体的な変更：

### SOW テンプレート

- Executive Summary → Overview テーブルに統合
- Problem Analysis (I-001) → Background 自由記述
- Assumptions (A-001) → 削除（必要なら Background に含める）
- WHEN/THEN AC → チェックリスト形式
- Scope (In/Out) セクションを追加
- 不使用セクション（Success Metrics, Verification Checklist, References）を削除

### Spec テンプレート

- Assumptions (SA-001) → 削除（SOW と重複）
- Test は Spec を正式な詳細記述の場とする

### ADR テンプレート（4種）

- プレースホルダ羅列 → 「When to Use」「Required Sections」「Template-Specific Sections」「Example」の4セクション構成に変更
- コードフェンスを ``` (3 tick) に統一
- 例として実際の ADR に近い散文スタイルを掲載

### reviewer-spec

- Required Sections をテンプレートの実際のセクション名に同期
- 存在しない `API Spec` 参照を除去

## Consequences

### ポジティブ

- テンプレートが実態と整合し、実際に参照される資産になる
- ADR は人間が読みやすい散文を促進
- SOW/Spec は AI による機械的検証が容易な構造を維持
- reviewer がテンプレートと同期し、偽陽性が減少

### ネガティブ

- 3文書間のテンプレートフォーマットが統一されない
- 既存 24本の SOW は旧テンプレート形式のまま残る（書き直しは Out of Scope）

## References

- ADR-0005: ドキュメントの役割分離とAI最適化（本 ADR の前提となる原則）
- `rules/conventions/DOCUMENTATION.md` - ドキュメント規約

## Reassessment Triggers

- SOW 以外の文書でもテンプレート無視が起き始めたとき
- AI 読み手が構造化テーブルより散文を正確に扱えるという実測が出たとき
