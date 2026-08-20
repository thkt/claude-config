---
status: "superseded by DR-0055"
date: 2026-04-24
decision-makers: thkt
---

# Adopt ctx- prefix for agent-only skills

## Context and Problem Statement

`reviewing-*` 5 skill と `optimizing-performance` 1 skill は `user-invocable: false` かつ `context: fork` で特定 agent にバインドされる「agent 専用 knowledge skill」カテゴリに属する。しかし命名は user-invocable な動詞-ing skill と区別がつかず、LLM discovery 時に識別困難。

| skill                     | agent                | user-invocable |
| ------------------------- | -------------------- | -------------- |
| reviewing-readability     | reviewer-readability | false          |
| reviewing-security        | reviewer-security    | false          |
| reviewing-silent-failures | reviewer-silence     | false          |
| reviewing-testability     | reviewer-testability | false          |
| reviewing-type-safety     | reviewer-strictness  | false          |
| optimizing-performance    | reviewer-performance | false          |

ADR-0052 で `use-*` を CLI wrapper 専用と確定したが、agent 専用 skill の命名指針は未確立。ADR-0049 Reassessment Triggers に「reviewing-*/reviewer 拡張検討」が予約されてたが未着手。

## Decision Drivers

- LLM discovery の category identification 向上（ADR-0052 と同じ動機を別カテゴリに適用）
- 命名での agent binding 明示（agent 名が skill 名に入れば対応関係が自明）
- `use-*` (CLI wrapper) / 動詞-ing (user-invocable workflow) / 新 prefix (agent-only) の 3 カテゴリ視覚分離
- `context: fork` の load-bearing 構造維持（集約すると knowledge inject の挙動が変わる懸念）
- 動詞-ing 削除方針 (feedback_skill-refactoring-policy.md) との整合

## Considered Options

### Option 1: `ctx-<agent-name>` prefix 統一（採用）

全 agent 専用 skill を `ctx-<agent-name>` に改名。

| Before                    | After                    |
| ------------------------- | ------------------------ |
| reviewing-readability     | ctx-reviewer-readability |
| reviewing-security        | ctx-reviewer-security    |
| reviewing-silent-failures | ctx-reviewer-silence     |
| reviewing-testability     | ctx-reviewer-testability |
| reviewing-type-safety     | ctx-reviewer-strictness  |
| optimizing-performance    | ctx-reviewer-performance |

- Good: agent 名が skill 名に含まれ対応関係が一目瞭然
- Good: `ctx-` が `context: fork` 運用と意味一致
- Good: `use-*` / `ctx-*` / 動詞-ing の 3 カテゴリで視覚識別
- Good: ADR-0049 Reassessment Triggers に「分離維持 + 命名明示」で回答
- Bad: 6 skill rename + agents 参照更新 + marketplace.json 更新 + .ja/ mirror
- Bad: marketplace.json path 破壊的変更（ADR-0052 と同質）

### Option 2: `use-agent-*` prefix

- Good: `use-` で統一感
- Bad: ADR-0052 で `use-*` は CLI wrapper 専用と確定。意味混在
- Bad: `use-agent-reviewer-performance` が冗長

### Option 3: 集約 (ADR-0049 の論理を 6 pair に拡張)

各 agent.md に skill 内容をマージし skill 削除。

- Good: skill list ノイズ削減 (6 → 0)
- Good: ADR-0049 precedent と一貫
- Bad: `context: fork` の knowledge inject が機能するか要検証（実装依存）
- Bad: agent.md 肥大化（各 reviewer の knowledge は 100+ lines）
- Bad: knowledge と orchestration の role separation 喪失
- Bad: 将来 user-invocable 化するパスを潰す

### Option 4: 現状維持

- Good: 破壊的変更なし
- Bad: 動詞-ing 命名が user-invocable 有無の両方で使われ区別困難
- Bad: LLM discovery 時のカテゴリ識別性なし

## Decision Outcome

Chosen: Option 1。3 カテゴリ視覚分離と agent 対応明示を両取り。集約は role separation 喪失のリスクが大きく、現状維持は 0049 の Reassessment Triggers に回答しない。

### Positive Consequences

- skill 命名から agent binding が自明になる
- `use-*` / `ctx-*` / 動詞-ing の 3 カテゴリで discovery 精度向上
- ADR-0049 の予約事項に最終回答

### Negative Consequences

- 6 skill rename、参照更新、marketplace.json 破壊的変更（ADR-0052 と同質のコスト）
- 動詞-ing 命名の直感性喪失（ただし user-invocable 分離の方が価値大）

## Scope

適用対象:

- skills/{reviewing-_, optimizing-performance} → skills/ctx-_-reviewer (6 pair)
- .ja/skills/ ミラー側も同等
- agents/reviewers/*-reviewer.md の `skills:` 配列を新名に更新
- .claude-plugin/marketplace.json の path を新名に更新
- rule docs (SKILLS_AGENTS.md 等) の言及を更新

対象外:

- user-invocable: true skill（動詞-ing 維持）
- `use-*` CLI wrapper (ADR-0052 scope)
- generator 系 (ADR-0048 scope)

## Migration Strategy

1. skills/ 6 ディレクトリ rename
2. 各 SKILL.md frontmatter の `name:` を新名に更新
3. agents/reviewers/*-reviewer.md の `skills:` 配列を新名に更新
4. .claude-plugin/marketplace.json の `skills` path を新名に更新
5. .ja/skills/ ミラー側も同等処理
6. rule docs の言及を grep で洗い出して更新
7. ADR-0049 の Reassessment Triggers を closed とマーク

## Rollback Plan

Trigger Conditions:

- `ctx-*` が LLM discovery に想定より悪影響
- agent skill に直接 user-invoke path が追加される設計変更

Rollback Steps:

1. git revert で rename 戻す
2. marketplace.json を旧 path に戻す
3. 新 ADR で再変更の理由を記録

## Reassessment Triggers

- agent 専用 skill が user-invocable に昇格した時
- Claude Code harness が skill discovery の visibility 制御を変更した時（user-invocable: false の expose 動作変更）
- skill → agent 以外の binding パターンが登場した時

## Related ADRs

- [ADR-0004: スキル中心アーキテクチャへの再構成](0004-skill-centric-architecture-restructuring.md) - skill 命名の上位方針
- [ADR-0048: Standardize generator skill structure](0048-standardize-generator-skill-structure.md) - skill-to-agent パターン (本 ADR 対象外)
- [ADR-0049: Consolidate skill-to-skill wrapper pairs](0049-consolidate-skill-to-skill-wrapper-pairs.md) - Reassessment Triggers で予約された「reviewing-*/reviewer 拡張」に本 ADR が回答
- [ADR-0052: Unify skill naming with use- prefix for CLI wrappers](0052-unify-skill-naming-with-use-prefix-for-cli-wrappers.md) - 同じ discovery category identification 動機で別カテゴリ (CLI wrapper) を処理

---

_Created: 2026-04-24_
_Author: thkt_
_ADR Number: 0053_
