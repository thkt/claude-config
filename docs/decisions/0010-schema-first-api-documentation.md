---
status: "accepted"
date: 2026-02-08
decision-makers: thkt
---

# Schema-First API ドキュメント生成と Dual Output

## Context and Problem Statement

`/docs api` コマンドの api-analyzer は grep ベースの5フェーズで API ドキュメントを生成しているが、監査で19件の問題（CRITICAL 5, HIGH 6, MEDIUM 4, 構造的 4）が検出された。パス不一致、スキーマフィールド名の誤り、必須パラメータの欠落など、参照して実装するとバグを生むレベルの不正確さがある。また、生成結果は MD のみで永続化され、他エージェント（architect-feature/explorer）が機械的に参照できない。

## Decision Drivers

- API ドキュメントの正確性（schema.ts を source of truth として）
- architecture と同様の dual output パターンとの一貫性
- architect-feature/explorer が api.yaml を seed context として活用
- 実装コストの現実性（~290 lines）
- 段階的な精度向上（regex → AST parser）

## Considered Options

1. Pragmatist: Read ベース全文読み取り + architecture.yaml 再利用
2. Architect: Schema-First + Two-stage validation
3. Advocate: OpenAPI 標準準拠 + Example-first UX
4. Hybrid: Schema-First with Architectural Guidance

## Decision Outcome

Chosen option: "Hybrid: Schema-First with Architectural Guidance", because Architect の schema-first accuracy と Pragmatist の architecture.yaml 活用によるシンプル化を組み合わせ、5人チーム（3 thinker + challenger + synthesizer）による検討で最高の weighted score (3.90/5) を獲得した。

### Consequences

#### Positive Consequences

- schema.ts を正として読むことで、フィールド名・型・必須/任意の正確性が向上
- `.analysis/api.yaml` + `.analysis/api.md` の dual output で machine/human 両方に対応
- architect-feature/explorer が api.yaml を seed context として参照可能
- confidence タグ (verified/inferred/unknown) で情報の信頼性が明示的
- architecture.yaml の dual output パターンを再利用し一貫性を確保

#### Negative Consequences

- regex ベースの TS parsing は nested types で誤検出リスクあり
- dual output の同期を保つ仕組みが必要
- OpenAPI 準拠は Phase 2 に延期（エコシステム統合は後回し）

## Pros and Cons of the Options

### Pragmatist: Read ベース全文読み取り

- Good, because 最もシンプル（Read ツールで全文読み取り）
- Good, because architecture.yaml の既存パターンを再利用
- Bad, because Express/Next lock-in（Flask/FastAPI 対応に大幅改修）
- Bad, because dual output 同期の仕組みが未設計
- Bad, because 実装見積もり（80 lines）が非現実的

### Architect: Schema-First + Two-stage validation

- Good, because schema.ts を source of truth として最高精度
- Good, because Extension Points による拡張性
- Good, because confidence タグで信頼性を明示
- Bad, because 7 components 設計が agent の procedural 制約と乖離
- Bad, because TS parsing の複雑性が曖昧

### Advocate: OpenAPI 標準準拠

- Good, because OpenAPI ecosystem との統合で最高の DX
- Good, because Quick Start, curl examples による実用性
- Bad, because 実装コスト最大（500+ lines）
- Bad, because OpenAPI 必須要素（$ref, schemas）の生成が複雑
- Bad, because 新規標準導入で既存ツールとの統合コスト

### Hybrid: Schema-First with Architectural Guidance

- Good, because schema-first の高精度 + architecture.yaml 活用のシンプルさ
- Good, because 段階的実装（regex → AST）で初期コスト抑制
- Good, because auto-update.sh パターンで dual output 同期を既存実装に準拠
- Bad, because regex フェーズの精度限界（nested types）
- Bad, because OpenAPI 統合は後回し

## Implementation Phases

| Phase | 内容                                                     | 見積もり       |
| ----- | -------------------------------------------------------- | -------------- |
| 1     | api-analyzer を schema-first に書き換え（regex ベース）  | 150 lines      |
| 2     | dual output (api.yaml + api.md) を docs.md に追加        | 80 lines       |
| 3     | architect-feature/explorer に api.yaml seed context 統合 | 60 lines       |
| 4     | confidence タグ (verified/inferred/unknown)              | Phase 1 に含む |

## Rollback Plan

**Trigger Conditions**:

- schema-first で verified 率が 50% 未満（grep ベースは全て unknown）
- dual output で YAML/MD 不一致が 3回以上発生

**Rollback Steps**:

1. api-analyzer.md を git revert で復元
2. docs.md の dual output セクションを削除
3. この ADR の Status を Deprecated に更新

## Related ADRs

- [ADR-0005: Documentation Role Separation](0005-documentation-role-separation.md) - ドキュメントの役割分離
- [ADR-0008: Audience-Optimized Templates](0008-audience-optimized-templates.md) - 読み手別テンプレート

---

_Created: 2026-02-08_
_Author: thkt_
_ADR Number: 0010_
