---
status: "accepted"
date: 2026-02-10
decision-makers: thkt
---

# Audit パイプラインに Evidence Verifier を追加

## Context and Problem Statement

現在の `/audit` パイプラインは Reviewer(検出) → Challenger(反論) → Integrator(統合) の 3 段階で構成されている。Challenger は finding を否定する方向（偽陽性の排除）にのみ検証しており、肯定方向の検証（finding が実際に問題であるエビデンスの収集）が欠如している。これにより:

- Challenger が誤って棄却した本物の問題（false negative）を検出できない
- 「確かに問題である」というエビデンス付き確認がないまま報告される
- Integrator は Challenger の一方的な評価のみで判断している

## Decision Drivers

- Audit 結果の正確性向上（false positive AND false negative の両方を削減）
- 科学的方法論との整合（仮説 → 反証 → 再現 → 結論）
- 既存エージェントの責務分離の改善（検出と検証の分離）
- 単一責任原則（反論と立証は異なる認知スタンス）

## Considered Options

1. Pragmatist: 既存 Challenger を拡張して反論+検証を兼務
2. Architect: Evidence Verifier を新設し Challenger と並列実行
3. DX Advocate: 各 Compound Reviewer 内でドメイン固有の検証を実行

## Decision Outcome

Chosen option: "Architect: Evidence Verifier を新設し Challenger と並列実行", because 反論と検証は認知的に逆方向の作業であり、同一エージェントに両方を担わせると確証バイアスまたは形骸化のリスクがある。並列実行により情報損失がゼロで、Integrator が裁判官として両方の独立評価に基づき判断できる。

### Consequences

#### Positive Consequences

- `disputed × verified` の新シグナルにより false negative を検出可能
- Reviewer の confidence 閾値を ≥0.80 → ≥0.60 に引き下げ、検出の網を広げられる
- `verification_hint` フィールドにより Reviewer のドメイン知識を Verifier に伝達
- Integrator が reconciliation rules で両方の証拠に基づく判断を実行

#### Negative Consequences

- チーム構成が 5→6 agent に増加（トークンコスト増）
- Integrator の reconciliation logic が複雑化
- 全 Reviewer の出力スキーマ変更が必要（`verification_hint` 追加）

## Pros and Cons of the Options

### Pragmatist: Challenger 拡張

- Good, because チーム構成変更なし、最小の実装コスト
- Bad, because 否定と肯定の同時実行は認知的矛盾
- Bad, because LLM はプロンプト前半の指示に偏る傾向があり、検証が形骸化するリスク
- Bad, because テスト時に反論と検証を分離してテストできない

### Architect: Evidence Verifier 新設（並列）

- Good, because 単一責任 - 各エージェントが一方向の認知に集中
- Good, because 並列実行で情報損失ゼロ（Challenger の誤棄却を Verifier が検出可能）
- Good, because Integrator が裁判官として客観的に判断
- Bad, because +1 agent のトークン・通信コスト
- Bad, because Integrator の reconciliation rules の設計が必要

### DX Advocate: Compound Reviewer 内検証

- Good, because ドメイン専門家が自ドメインの検証を実行
- Bad, because 検出者が自分の finding を検証するのは確証バイアス
- Bad, because Compound Reviewer の複雑化 ×3
- Bad, because クロスドメイン検証ができない

## Pipeline Change

```text
Before:
  Reviewers → Challenger → Integrator → Leader

After:
  Reviewers → [Challenger ∥ Verifier] → Integrator(裁判官) → Leader
```

## Reconciliation Rules

優先順に適用:

1. disputed + verified → needs_review (confidence = verifier.confidence)
2. Any + verified → confirmed (confidence = max; downgraded なら原 severity 復元)
3. Any + unverifiable → challenger verdict 維持、confidence を 0.10 減算
4. Any + weak_evidence + budget_exhausted → challenger verdict 維持、`needs_context` フラグ
5. Any + weak_evidence → challenger verdict 維持
6. Verifier-only mode: verified→confirmed, weak_evidence→needs_context, unverifiable→exclude

詳細は [team-integration.md](../agents/teams/team-integration.md)。

## Rollback Plan

**Trigger Conditions**:

- Verifier の verified 率が全 finding の 10% 未満（検証が形骸化）
- Integrator の reconciliation で `disputed × verified` が 3 回連続ゼロ（付加価値なし）
- 全体のトークンコストが 1.5 倍超に増加

**Rollback Steps** (Note: Steps 1-2 reference pre-ADR-0012 architecture. See ADR-0012 for current pipeline.):

1. `audit.md` のチーム構成を 5 agent に戻す
2. Compound Reviewer の DM 先から `verifier` を削除
3. Integrator から reconciliation rules を削除
4. Reviewer の confidence 閾値を ≥0.80 に戻す
5. この ADR の Status を Deprecated に更新

## Baseline Metrics (2026-02-12 初回 audit)

| Metric                                    | Value      |
| ----------------------------------------- | ---------- |
| Total findings processed                  | 94         |
| Verified                                  | 63 (67.0%) |
| Weak evidence                             | 17 (18.1%) |
| Unverifiable                              | 0 (0.0%)   |
| Verification rate                         | 78.8%      |
| False positive rate (post-reconciliation) | 21.3%      |
| disputed + verified (Rule 1 catches)      | 6          |

## Related ADRs

- [ADR-0004: Skill-Centric Architecture Restructuring](0004-skill-centric-architecture-restructuring.md) - エージェント構成の基盤

---

_Created: 2026-02-10_
_Author: thkt_
_ADR Number: 0011_

## Reassessment Triggers

- Challenger と Evidence Verifier の出力が重なり、Integrator が両方を読む必要が無くなったとき
- 並列実行のコストが audit 全体の所要時間を支配するようになったとき
