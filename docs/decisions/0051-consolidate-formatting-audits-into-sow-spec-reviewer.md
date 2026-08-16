---
status: "accepted"
date: 2026-04-23
decision-makers: thkt
---

# ADR-0051: Consolidate formatting-audits skill into reviewer-spec agent

## Context and Problem Statement

`formatting-audits` skill は Gate / Priority / Finding Format の canonical source として、`reviewer-spec` agent + 3 箇所（`validating-specs` skill, `enhancer-evidence` agent, `verify/gate-decision.md`）から参照されていた。実ロード経路を検証した結果、構造と実態に乖離があった。

| 参照元                  | skills:[] ロード         | 実態                           |
| ----------------------- | ------------------------ | ------------------------------ |
| reviewer-spec agent     | 入ってる                 | 実ロード                       |
| validating-specs skill  | 入ってない（agent 経由） | reviewer-spec 文脈で間接ロード |
| enhancer-evidence       | 入ってない               | 文字列ヒントのみ、実ロードなし |
| verify/gate-decision.md | 入ってない               | 文字列ヒントのみ、実ロードなし |

さらに `enhancer-evidence` と `/verify` は対象が違う Gate 体系（実装コード検証）で、`formatting-audits` の Priority Assignment（"CC will escalate?"）は SOW/Spec レビュー専用の判定軸だった。canonical source という文字列参照は実態と乖離していた。

## Decision Drivers

- ADR-0049 の caller=1 論理（「複数箇所で使用の前提が empirical に成立しない」）が skill-to-agent パターンにも適用可能
- reviewer-spec agent が唯一の実ロード先
- 他3箇所の参照は文字列ヒントで実挙動に影響なし
- Skill list のノイズ削減
- canonical source ラベルと実態の乖離解消

## Considered Options

### Option A: 統合 (採用)

`reviewer-spec` agent に `formatting-audits` 本文（Outcome Basis, Priority, Priority Assignment, Gate, Finding Format, Legacy Format Handling）を吸収。skill 削除。他3箇所の参照は agent への参照、または独自定義に書き換え。

- Good: 実態と構造が一致
- Good: Skill list から不要 entry 削減
- Good: Priority Assignment が SOW/Spec レビュー専用であることが明示
- Bad: agent body が 240 行から約320行に増加

### Option B: 現状維持

- Good: 変更コスト 0
- Bad: canonical source ラベルが実態と乖離
- Bad: サブエージェント限定なのに skill として独立しているという構造違和感

### Option D: 薄い wrapper 化

skill を残すが本文を極小化。description + `agent:` 指定のみ。

- Good: Claude の skill 抽選経路維持
- Bad: 薄い wrapper の存在は ADR-0049 論理と逆方向
- Bad: agent list で十分に routing 可能なので wrapper の load-bearing 性が弱い

## Decision Outcome

Chosen option: Option A。理由:

1. reviewer-spec agent が formatting-audits の唯一の実ロード先（caller=1, self-reference）
2. 他3箇所は文字列ヒントで、実効的な参照ではない
3. enhancer-evidence と /verify は独立した Gate 体系を持つべき（判定対象が違う）
4. ADR-0049 の caller=1 論理を skill-to-agent パターンに拡張

### Positive Consequences

- Skill list から formatting-audits 削除
- reviewer-spec 単体で SOW/Spec レビューロジック完結
- 他 reviewer/integrator は独自の Gate 定義を持てる
- canonical source ラベルと実挙動の乖離が解消

### Negative Consequences

- reviewer-spec agent body の肥大化（+80 行程度）
- `validating-specs` / `enhancer-evidence` / `verify/gate-decision.md` の参照書き換えコスト
- `marketplace.json` と `.ja/` ミラー更新コスト
- Claude の skill 抽選経路が失われる（agent list で代替可能）

## Scope

適用対象:

- `skills/formatting-audits/` 削除（英日両方）
- `agents/reviewers/reviewer-spec.md` に本文統合（英日両方）
- `skills/validating-specs/SKILL.md` 参照書き換え（英日両方）
- `agents/enhancers/enhancer-evidence.md` 参照削除（英日両方）
- `skills/verify/references/gate-decision.md` 参照削除（英日両方）
- `.claude-plugin/marketplace.json` sentinels skills 配列更新

対象外:

- `docs/SKILLS_AGENTS.md`: formatting-audits 言及なし、reviewer-spec のみ記載
- `skills/think/references/step-9-10-review-decomposition.md`: agent を名前で直接呼ぶ、skill 経由なし
- `teams/default/inboxes/integrator.json`: 動的メッセージログ

## Rollback Plan

Trigger Conditions:

- reviewer-spec 以外が Priority Assignment の同じロジックを必要とする状況
- reviewer-spec agent body が 500 行超過（SKILLS.md 閾値）

Rollback Steps:

1. reviewer-spec agent から Gate / Priority / Finding Format セクションを切り出し
2. 新しい skill として再独立（命名は `sow-spec-gate` 等、役割を明示）
3. 参照元を再度書き換え

## Reassessment Triggers

- enhancer-evidence や /verify が reviewer-spec の Priority Assignment と同じロジックを必要とする状況
- 新しい Gate 判定器が同じ Priority / Finding Format を再利用したい場合

## Related ADRs

- [ADR-0042: Colocate Skill-Specific Scripts Within Skill Directory](0042-colocate-skill-specific-scripts-within-skill.md). 同じ caller=1 colocate 論理
- [ADR-0049: Consolidate skill-to-skill wrapper pairs](0049-consolidate-skill-to-skill-wrapper-pairs.md). 本 ADR は scope 外の skill-to-agent ケース
- [ADR-0050: Consolidate /fix via skill delegation](0050-consolidate-fix-via-skill-delegation.md). caller=0 case の類例

---

_Created: 2026-04-23_
_Author: thkt_
_ADR Number: 0051_
