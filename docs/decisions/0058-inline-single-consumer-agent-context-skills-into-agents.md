---
status: "accepted"
date: 2026-05-01
decision-makers: thkt
---

# Inline single-consumer agent context skills into agents

## Context and Problem Statement

ADR-0053 で skill 集約 (Option 3) を却下した 4 理由のうち、検証で 2 つが失効した。

| 理由 | 元の論拠                                               | 検証結果                                                                                                                         |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| A    | `context: fork` の knowledge inject が機能するか要検証 | 検証済: agent `skills: [...]` 注入は parent context window に直接 inject、子 fork context では消費されない。inline と token 等価 |
| D    | 将来 user-invocable 化するパスを潰す                   | user 確認済: user-invocable とは完全切り離し設計を確定                                                                           |

残る B (agent.md 肥大化) と C (knowledge と orchestration の role separation) は valid だが、multi-consumer skill (DRY が機能) と single consumer skill (DRY 不在) で適用度が異なる。現状の use-context-* skill は consumer 数で 2 群に分かれる。

| skill                            | consumer | DRY |
| -------------------------------- | -------- | --- |
| use-context-reviewer-readability | 4        | yes |
| use-context-root-cause-analysis  | 3        | yes |
| use-context-reviewer-strictness  | 2        | yes |
| use-context-reviewer-performance | 1        | no  |
| use-context-reviewer-security    | 1        | no  |
| use-context-reviewer-silence     | 1        | no  |
| use-context-reviewer-testability | 1        | no  |

## Decision Drivers

- ADR-0053 根拠 A (skill injection 動作) の失効反映
- ADR-0053 根拠 D (future user-invocable) の user 切り離し方針による無効化
- DRY が機能する skill のみ skill 化維持
- single consumer skill は agent self-contained 化で発見性 + メンテ性向上

## Considered Options

- Option 1: 中間案 - DRY threshold = 2+ consumer (採用)
- Option 2: 全 inline 化
- Option 3: 全維持 (ADR-0053 継続)
- Option 4: threshold 3+ (strictness も inline)

## Decision Outcome

Chosen: Option 1。multi-consumer 3 skill 維持 + single consumer 4 skill inline。DRY が load-bearing な skill のみ残し、orchestration knowledge の二重管理を解消する。

### Consequences

- Good: single consumer agent が self-contained、agent 単体読みで全動作把握可能
- Good: skill list の noise 削減 (use-context-* 7 から 3)
- Good: ADR-0053 根拠 A/D の失効を ADR で明示記録
- Bad: single consumer agent body 肥大化 (推定 +30-60 lines per agent)
- Bad: references/ 参照チェーンが skill -> references から agent -> references に変化
- Bad: ADR-0053 を一部 supersede する設計揺らぎ

### Confirmation

- skill ディレクトリ削除後、対象 4 agent body に元 skill content が反映されてることを grep で確認
- 該当 agent frontmatter から `skills: [use-context-...]` 行が削除されてることを確認
- .claude-plugin/marketplace.json から該当 skill path 削除を確認
- multi-consumer 3 skill が touch されてないこと確認

## Pros and Cons of the Options

### Option 1: 中間案 (採用)

multi-consumer skill 維持、single consumer skill inline。

- Good: DRY が機能する箇所のみ skill 化、それ以外は self-contained
- Good: agent body が「自己完結 single」「skill 注入 multi」の二態で明示的
- Bad: skill structure がハイブリッド化 (3 + inline 4)

### Option 2: 全 inline 化

全 7 skill を agent body に取り込む。

- Good: skill structure 統一
- Bad: multi-consumer (4, 3, 2) で DRY 違反、knowledge 同期が手動
- Bad: ADR-0053 根拠 B を全 reviewer 適用

### Option 3: 全維持 (現状)

ADR-0053 方針継続、再評価しない。

- Good: 破壊的変更なし
- Bad: A/D 理由失効を反映しない、古い前提に依存
- Bad: single consumer skill が DRY 不在のまま skill 化を正当化できない

### Option 4: threshold 3+

readability/root-cause のみ skill 維持、strictness と single consumer は inline。

- Good: より厳格な DRY threshold
- Bad: 2-consumer (strictness) で DRY 違反受容
- Bad: future 3 consumer 到達で再 skill 化の逆行リスク

## More Information

### Architecture Diagram

```text
Before (ADR-0053 期):
agents/reviewers/reviewer-{performance,security,silence,testability}.md
  ↓ skills: [use-context-reviewer-X]
skills/use-context-reviewer-X/ (inject content)

After (ADR-0058):
agents/reviewers/reviewer-{performance,security,silence,testability}.md
  └── (inline body) → references skills/use-context-reviewer-X/references/*.md (path 維持)

(multi-consumer 3 skill は変更なし)
```

### Quality Attributes

| Attribute                   | Priority | Approach                  |
| --------------------------- | -------- | ------------------------- |
| DRY when shared             | High     | Multi-consumer skill 維持 |
| Self-containment for single | High     | Agent body inline         |
| Discoverability             | Medium   | skill list の noise 削減  |

### Trade-offs

agent.md 肥大化を受け入れて、single consumer skill の orchestration を agent self-contained 化。multi-consumer は DRY 維持。

### Reassessment Triggers

- single consumer skill が 2+ consumer になった時 (再 skill 化検討)
- multi-consumer skill が single 化した時 (inline 化検討)
- Claude Code harness の skill injection mechanism が変更された時

### Related ADRs

- [ADR-0049: Consolidate skill-to-skill wrapper pairs](0049-consolidate-skill-to-skill-wrapper-pairs.md) - skill 間集約論議
- [ADR-0053: Adopt ctx- prefix for agent-only skills](0053-adopt-ctx-prefix-for-agent-only-skills.md) - 本 ADR が根拠 A/D を上書き、Option 3 を再評価
- [ADR-0055: Consolidate user-invocable:false skills under use- prefix](0055-consolidate-user-invocable-false-skills-under-use-prefix.md) - naming のみ、構造論議は継承せず
