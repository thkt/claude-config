---
status: "accepted"
date: 2026-04-21
decision-makers: thkt
---

# ADR-0050: Consolidate /fix via skill delegation; retire fix-workflow.md

ADR-0049 の precedent (caller=1 → colocate) を caller=0 case に拡張する論理

## Context and Problem Statement

ADR-0004 §4 は全コマンドを「薄いラッパー + workflow reference」構造に統一する方針を決めた。
運用後の棚卸しで `/fix` と `fix-workflow.md` の関係を実測:

| 指標                                               | 実測値                                |
| -------------------------------------------------- | ------------------------------------- |
| `skills/fix/SKILL.md` から `fix-workflow.md` 参照  | 0 件 (grep)                           |
| `docs/COMMANDS.md:74` の /fix Skills 欄            | `-` (「Skills 不使用」を明示)         |
| `orchestrating-workflows/SKILL.md:17` Workflows 表 | `/fix → fix-workflow.md` と掲げ続ける |

「`orchestrating-workflows` が掲げているが `/fix` は参照しない」矛盾が empirical に確定。
`fix-workflow.md` は caller=0 で孤立している。

加えて、`fix-workflow.md` 内の knowledge (5 Whys Questions, regression test pattern,
parallel verification, Confidence bands) は既に他 skill が own している:

| 内容          | Canonical owner                   |
| ------------- | --------------------------------- |
| 5 Whys        | `skills/root-cause-analysis/`     |
| RGRC / TDD    | `skills/use-workflow-tdd-cycle/`  |
| Quality gates | `skills/orchestrating-workflows/` |

中間 reference として `fix-workflow.md` を残すと、下流 skill と重複した knowledge が
孤立した caller=0 の場所に存在し続けることになる。

## Decision Drivers

- ADR-0049 precedent (caller=1 → colocate) を caller=0 case に拡張する整合性
- DRY: 下流 skill (`root-cause-analysis`, `use-workflow-tdd-cycle`) に canonical knowledge を残す
- Miller's Law:/fix SKILL.md は delegation + glue のみで 6-7 セクション維持
- Debug Investigation Protocol (`rules/core/OPERATION.md`) との整合: obvious/non-obvious 区別
- Escalation trigger の objective 化: 自己申告 Confidence を撤廃

## Considered Options

### Option 1: /fix を self-contained 化 (fix-workflow.md 吸収)

`fix-workflow.md` の内容を `/fix SKILL.md` に直接移植し、`fix-workflow.md` を削除。

- Good: 1 ファイルで完結、見通しが良い
- Bad: 既に `root-cause-analysis`/`use-workflow-tdd-cycle` が own する knowledge を重複保持
- Bad: SKILL.md 肥大化 (推定 130〜150 行)、Miller's Law 超過リスク

### Option 2: /fix を薄いラッパー + workflow reference 維持 (ADR-0004 §4 踏襲)

`fix-workflow.md` を `/fix SKILL.md` から明示参照。

- Good: ADR-0004 §4 の一般原則と表面的に整合
- Bad: caller=0 の load-bearing 化は ADR-0049 precedent に反する
- Bad:「薄いラッパー + 空ターゲット」は最悪の組み合わせ (間接 1 hop で得るものなし)

### Option 3: /fix を skill delegation 型に再定義 (採用)

`/fix SKILL.md` は routing + glue のみ。詳細知識は既存 skill に delegate。

- Good: ADR-0049 の「caller=1 → colocate」論理を caller=0 case に拡張
- Good: DRY を下流 skill 側で維持
- Good: Miller's Law 内 (推定 120 行、6-7 セクション)
- Good: `OPERATION.md` Debug Investigation Protocol と整合 (obvious skip path)
- Bad: `orchestrating-workflows/SKILL.md` と `.ja/` ミラーの参照更新コスト
- Bad: ADR-0004 §4 の一般原則に対して `/fix` を例外化する記録が要る (本 ADR)

## Decision Outcome

Chosen option: Option 3。理由は ADR-0049 と同じ「caller 数が empirical 要件を満たさない」
パターンで、caller=0 が確定しているため。ADR-0049 の論理を自然に拡張する形。

### Positive Consequences

- `fix-workflow.md` 60 行の dead code 削除
- `/fix SKILL.md` と下流 skill の責務分離が明示化
- obvious bug fast path の新設でアウトカム「素早く」に貢献
- Confidence 自己申告撤廃、objective Escalation trigger に絞ることで判断二重化を解消

### Negative Consequences

- `orchestrating-workflows/SKILL.md`/`.ja/` ミラーの参照更新
- ADR-0004 §4 を一部 supersede する履歴管理コスト
- 将来 `/fix` が大規模化した場合は再モジュール化が必要 (rollback plan 参照)

## Current Process vs New Process

| Aspect                                 | Before                                       | After                                                 |
| -------------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| workflow reference                     | `fix-workflow.md` が caller=0 で孤立         | 撤去、下流 skill に delegate                          |
| 5 Whys 呼び出し                        | Standard Flow で「(5 Whys)」とだけ記載       | `Skill("root-cause-analysis")` 明示                   |
| obvious bug path                       | なし。全 bug が 5 Whys + generator-test 経由 | Direct fix path を新設、obvious 条件で skip           |
| Confidence 機構                        | `<50 / 50-69` で自己申告、測定ルール不在     | 撤廃。objective Escalation trigger に絞る             |
| defense-in-depth trigger               | Skills & Agents 表に記載のみ (orphan)        | `root-cause-analysis` 出力の Pattern フィールドと連動 |
| `orchestrating-workflows` Workflows 表 | /code + /fix 2 エントリ                      | /code のみ 1 エントリ                                 |

## Transition Plan

### Phase 1: /fix SKILL.md 構造更新

1. Routing section 追加 (`$1 =~ /^SUG-/` vs 通常)
2. Obvious/Non-obvious 判定表を Execution 冒頭に追加
3. Standard Flow Non-obvious 側 Step 1: `Skill("root-cause-analysis")` 明示
4. Standard Flow Obvious 側: Direct fix path (5 Whys + regression skip)
5. Standard Flow Non-obvious 側 Step 2: `generator-test` agent spawn (現行踏襲)
6. Escalation 表を objective trigger に再定義 (Confidence 行撤廃)
7. Skills & Agents 表を「Skill delegate/Agent spawn/Local reference」に分離
8. defense-in-depth 適用条件を Pattern 判定連動と明記

### Phase 2: 撤去

9. `skills/orchestrating-workflows/references/fix-workflow.md` 削除
10. `skills/orchestrating-workflows/SKILL.md` Workflows 表から `/fix` エントリ削除

### Phase 3: 同期

11. `.ja/skills/orchestrating-workflows/SKILL.md` 同期
12. `.ja/skills/fix/SKILL.md` 同期

### Phase 4: 記録

13. 本 ADR accepted 化
14. ADR-0049 Related ADRs に本 ADR 追加

## Rollback Plan

Trigger Conditions:

- `/fix` SKILL.md が 150 行超過 (Miller's Law 超過兆候)
- delegation 先の skill が 2 つ以上で責務分離が崩れる
- 2 つ目以降の command が同内容の workflow reference を必要とする

Rollback Steps:

1. `fix-workflow.md` を git 履歴から復元
2. `/fix SKILL.md` の該当箇所を参照形式に戻す
3. `orchestrating-workflows/SKILL.md` Workflows 表に `/fix` エントリ復活
4. 新 ADR で rollback 理由を記録

## Reassessment Triggers

- ADR-0004 §4「薄いラッパー + workflow reference」原則を他コマンドに再評価する時
- Claude Code harness が skill delegation の invocation semantics を変更した時
- `root-cause-analysis`/`use-workflow-tdd-cycle` skill の構造が大幅変更された時

## Related ADRs

- [ADR-0004: スキル中心アーキテクチャへの再構成](0004-skill-centric-architecture-restructuring.md) - §4 を部分 supersede
- [ADR-0049: Consolidate skill-to-skill wrapper pairs](0049-consolidate-skill-to-skill-wrapper-pairs.md) - 同じ「empirical caller 実測」論理
- [ADR-0002: /fix モジュール化とTDD共通化](0002-fix-modularization-and-tdd-commonization.md) - 当初の 6 モジュール化決定 (以降フラット化済み)
- [ADR-0001: code.md コマンドの責任分離](0001-code-command-responsibility-separation.md) -/code 側の薄いラッパー原則 (本 ADR 対象外)

---

_Created: 2026-04-21_
_Author: thkt_
_ADR Number: 0050_
