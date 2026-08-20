---
status: "superseded by DR-0055"
date: 2026-04-24
decision-makers: thkt
---

# Adopt workflow- prefix for workflow skills

## Context and Problem Statement

`user-invocable: false` の skill は ADR-0052 で CLI wrapper に `use-` prefix、ADR-0053 で agent 専用 skill に `ctx-` prefix を導入した。残余カテゴリ Workflow (orchestrating-workflows, validating-specs) は `verb-noun` パターン（接頭辞なし）のまま。

| skill                   | caller                                                               | user-invocable |
| ----------------------- | -------------------------------------------------------------------- | -------------- |
| orchestrating-workflows | /code SKILL.md, explorer-feature, team-implementation (各 `skills:`) | false          |
| validating-specs        | /think, /feature (spec validation phase)                             | false          |

ADR-0049 の「caller=1 → colocate」基準では対象外（orchestrating-workflows は caller=3）。しかし Workflow カテゴリだけ接頭辞なしで、skill list の視覚的識別が `use-*` / `ctx-*` と比べて弱い。

## Decision Drivers

- LLM discovery の category identification 向上（ADR-0052/0053 と同じ動機）
- 4 カテゴリ（short name / `use-*` / `ctx-*` / `workflow-*`）の視覚分離完成
- フルスペル採用で略語学習コスト回避（`wf-` より `workflow-` を優先）
- agent frontmatter `skills: [...]` 経由の knowledge inject 機能維持（colocate は選ばない）

## Considered Options

### Option 1: `workflow-<noun>` prefix 採用

全 Workflow skill を `workflow-<noun>` に改名。

| Before                  | After                    |
| ----------------------- | ------------------------ |
| orchestrating-workflows | workflow-code            |
| validating-specs        | workflow-spec-validation |

- Good: 4 カテゴリ（short / `use-*` / `ctx-*` / `workflow-*`）の視覚分離完成
- Good: ADR-0052/0053 の discovery category identification 論理を一貫適用
- Good: フルスペルで意味が一読で分かる
- Bad: 2 skill rename + 参照更新 + marketplace.json 破壊的変更
- Bad: `workflow-` 8 文字で `use-` / `ctx-` より長い（非対称）

### Option 2: `wf-` 略語 prefix

- Good: `use-` (4 文字) / `ctx-` (3 文字) と長さが揃う
- Bad: 略語覚えコスト、意味が一読で分からない
- Bad: `use-` / `ctx-` は英単語由来（前置詞・context）、`wf-` は独自略語

### Option 3: 現状維持（verb-noun）

- Good: 破壊的変更なし
- Bad: Workflow カテゴリだけ視覚的識別弱い状態が残る
- Bad: ADR-0052/0053 の動機に対して整合性欠く

### Option 4: /code 配下に colocate（ADR-0049 拡張）

- Bad: caller=3（/code + agent 2 つ）で caller=1 条件未達
- Bad: agent frontmatter `skills: [orchestrating-workflows]` の knowledge inject が壊れる

## Decision Outcome

Chosen: Option 1。ADR-0052/0053 と同じ動機を残余カテゴリに適用し、4 カテゴリ視覚分離を完成させる。略語より意味明確さ優先。

### Positive Consequences

- skill 命名から Workflow カテゴリが自明になる
- `use-*` / `ctx-*` / `workflow-*` / short name の 4 カテゴリで discovery 精度向上
- ADR-0052/0053 precedent と整合

### Negative Consequences

- 2 skill rename、参照更新、marketplace.json 破壊的変更
- `workflow-` prefix の非対称長さ（`use-` / `ctx-` より長い）

## Current Process vs New Process

| Aspect                       | Before                                  | After                     |
| ---------------------------- | --------------------------------------- | ------------------------- |
| Workflow skill 命名          | `orchestrating-workflows`（接頭辞なし） | `workflow-code`           |
| SKILLS.md Naming Workflow 行 | `verb-noun`                             | `workflow-<noun>`         |
| skill list 視覚識別          | 3 カテゴリ prefix + Workflow 無 prefix  | 4 カテゴリ全 prefix       |
| agent frontmatter 参照       | `skills: [orchestrating-workflows]`     | `skills: [workflow-code]` |

## Scope

適用対象:

- `skills/orchestrating-workflows/` → `skills/workflow-code/`
- `skills/validating-specs/` → `skills/workflow-spec-validation/`
- `.ja/skills/` ミラー側も同等
- `skills/code/SKILL.md` のテキスト参照
- `agents/explorers/explorer-feature.md`, `agents/teams/team-implementation.md` の `skills:` 配列
- `.claude-plugin/marketplace.json` の path
- `rules/conventions/SKILLS.md`, `rules/workflows/MODULARIZATION.md` の Naming table
- `docs/COMMANDS.md`, `docs/SKILLS_AGENTS.md` の言及

対象外:

- `user-invocable: true` skill（short name 維持）
- `use-*` CLI wrapper (ADR-0052 scope)
- `ctx-*` agent-only (ADR-0053 scope)
- generator 系 (ADR-0048 scope)

## Transition Plan

1. `skills/` 2 ディレクトリ rename（`orchestrating-workflows` → `workflow-code`, `validating-specs` → `workflow-spec-validation`）
2. 各 `SKILL.md` frontmatter の `name:` と H1 を新名に更新
3. `skills/code/SKILL.md` のテキスト参照「See orchestrating-workflows」→「See workflow-code」
4. `agents/explorers/explorer-feature.md`, `agents/teams/team-implementation.md` の `skills:` 配列更新
5. `.claude-plugin/marketplace.json` の `skills` path 更新
6. `rules/conventions/SKILLS.md`, `rules/workflows/MODULARIZATION.md` の Naming table Workflow 行を `workflow-<noun>` に更新 + example も更新
7. `docs/COMMANDS.md`, `docs/SKILLS_AGENTS.md` の言及更新
8. `.ja/` ミラー側も同等処理
9. 参照更新後に grep で旧名残存がないか確認

## Rollback Plan

Trigger Conditions:

- `workflow-*` が LLM discovery に想定より悪影響
- 新たな Workflow skill 追加時に命名が破綻する設計変更

Rollback Steps:

1. git revert で rename 戻す
2. marketplace.json を旧 path に戻す
3. 新 ADR で再変更の理由を記録

## Reassessment Triggers

- Workflow skill が 5 件超過した時（prefix 分類の再設計検討）
- Claude Code harness が skill discovery の visibility 制御を変更した時
- `workflow-*` / `ctx-*` / `use-*` 以外の `user-invocable: false` カテゴリが登場した時

## Related ADRs

- [ADR-0004: スキル中心アーキテクチャへの再構成](0004-skill-centric-architecture-restructuring.md) - skill 命名の上位方針
- [ADR-0049: Consolidate skill-to-skill wrapper pairs](0049-consolidate-skill-to-skill-wrapper-pairs.md) - caller=1 colocate 基準（本 ADR 対象は caller=3 で colocate 不適用）
- [ADR-0052: Unify skill naming with use- prefix for CLI wrappers](0052-unify-skill-naming-with-use-prefix-for-cli-wrappers.md) - 同じ discovery 動機、CLI wrapper カテゴリ
- [ADR-0053: Adopt ctx- prefix for agent-only skills](0053-adopt-ctx-prefix-for-agent-only-skills.md) - 同じ discovery 動機、Agent-only カテゴリ

---

_Created: 2026-04-24_
_Author: thkt_
_ADR Number: 0054_
