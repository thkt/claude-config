---
status: "accepted"
date: 2026-04-24
decision-makers: thkt
---

# ADR-0055: Consolidate user-invocable:false skills under unified use- prefix with role subcategories

## Context and Problem Statement

ADR-0052/0053/0054 で user-invocable: false の skill を 3 prefix (`use-*` / `ctx-*` / `workflow-*`) に分類し、「4 カテゴリ視覚分離」を完成させた。しかし skill 一覧をアルファベット順で表示すると、user-invocable: false skill が `c` / `u` / `w` に散在し、「内部運用 skill 全体」を単一グループとして識別できない。

| Prefix       | 例                       | Alphabet 位置 |
| ------------ | ------------------------ | ------------- |
| `use-*`      | use-git, use-yomu        | `u`           |
| `ctx-*`      | ctx-reviewer-readability | `c`           |
| `workflow-*` | workflow-code            | `w`           |

それぞれ役割を示す prefix だが alphabetical に散るため、一覧で「内部運用カテゴリ全体」を視覚的に一括把握できない。ADR-0052 は「CLI wrapper カテゴリを one-of-a-kind 化」する動機で採用されたが、カテゴリ間の統一 marker は scope 外だった。

user (2026-04-24) は以下の優先順位を明示:

1. 一貫性 > リネームコスト
2. アルファベット順で skill 一覧を grouping したい

## Decision Drivers

- skill 一覧でのアルファベット grouping (`u` セクションに user-invocable: false 全集約)
- 3 subcategory (CLI wrapper / Workflow / agent context) の内部役割識別を維持
- user の明示的な一貫性優先指示への直接回答
- フルスペル採用 (ADR-0054 方針継承)

## Considered Options

### Option 1: `use-cli-*` / `use-workflow-*` / `use-context-*` 統一 (採用)

全 user-invocable: false skill を `use-<role>-<name>` に再改名。

| Before (after 0052/0053/0054) | After (0055)                     |
| ----------------------------- | -------------------------------- |
| use-yomu                      | use-cli-yomu                     |
| use-git                       | use-cli-git                      |
| use-gh                        | use-cli-gh                       |
| use-npm                       | use-cli-npm                      |
| use-scout                     | use-cli-scout                    |
| use-recall                    | use-cli-recall                   |
| use-gcloud                    | use-cli-gcloud                   |
| use-heptabase                 | use-cli-heptabase                |
| workflow-code                 | use-workflow-code                |
| workflow-spec-validation      | use-workflow-spec-validation     |
| ctx-reviewer-readability      | use-context-reviewer-readability |
| ctx-reviewer-performance      | use-context-reviewer-performance |
| ctx-reviewer-silence          | use-context-reviewer-silence     |
| ctx-reviewer-strictness       | use-context-reviewer-strictness  |
| ctx-reviewer-testability      | use-context-reviewer-testability |
| ctx-reviewer-security         | use-context-reviewer-security    |

- Good: alphabetical sort で user-invocable: false が `u` に全集約
- Good: 3 subcategory (cli/workflow/context) で役割識別維持
- Good: フルスペル採用 (ADR-0054 方針継承)
- Good: user の明示的な一貫性優先指示への直接回答
- Bad: 命名が長い (`use-context-reviewer-silence` は 35 文字)
- Bad: ADR-0053 Option 2 却下理由 (`use-*` は CLI wrapper 専用と確定) を覆すため、`use-*` の semantic 再定義が必要
- Bad: 16 skill 再改名 + marketplace.json 破壊的変更 (0052/0053/0054 変更に続く 2 段階目)
- Bad: 24 時間以内に 3 ADR を supersede する設計揺らぎ

### Option 2: ADR-0052/0053/0054 維持 (3 prefix のまま)

- Good: 破壊的変更なし
- Good: 4 カテゴリ視覚分離が機能 (ADR-0054 設計通り)
- Bad: alphabetical grouping 未達成 (`c` / `u` / `w` 散在)
- Bad: user の明示的一貫性優先指示に対する回答なし

### Option 3: `use-*` / `use-wf-*` / `use-ctx-*` 短縮版

- Good: alphabetical grouping 達成 + prefix 長さ短い
- Bad: ADR-0054 でフルスペル採用決定済み (`wf-` 略語は覚えコスト理由で却下)
- Bad: フルスペル方針の逆行

### Option 4: skills/ 配下に use-/, ctx-/, workflow-/ サブディレクトリ

- Bad: skills loader は flat 固定 (reference_skill-discovery-spec.md) で subdir 非認識
- Bad: 実装不能

## Decision Outcome

Chosen: Option 1。user の明示的な一貫性優先指示 (2026-04-24) に従い、ADR-0052/0053/0054 を supersede。3 subcategory で役割識別を維持しつつ、alphabetical grouping を達成する。

### `use-` の semantic 再定義

ADR-0052 では `use-*` を「CLI wrapper 専用」と定義したが、本 ADR で「user-invocable: false skill の統一 marker」に拡張。subcategory (`-cli-` / `-workflow-` / `-context-`) が役割を明示する 3-segment 命名。

| Semantic      | Before (0052)           | After (0055)                        |
| ------------- | ----------------------- | ----------------------------------- |
| `use-` の意味 | CLI wrapper 専用 marker | user-invocable: false の統一 marker |
| 命名 segment  | 2 segment (`use-<cli>`) | 3 segment (`use-<role>-<name>`)     |
| CLI wrapper   | `use-yomu`              | `use-cli-yomu`                      |
| Workflow      | `workflow-code`         | `use-workflow-code`                 |
| Agent context | `ctx-reviewer-security` | `use-context-reviewer-security`     |

ADR-0053 Option 2 の却下理由「`use-*` は CLI wrapper 専用と確定」は本 ADR で上書き。却下時の「冗長」懸念は、alphabetical grouping の便益で相殺されると判断。

## Positive Consequences

- alphabetical sort で user-invocable: false が `u` 全集約
- 3 subcategory で役割識別維持 (cli / workflow / context)
- user の明示的な一貫性優先指示への直接回答
- 将来 user-invocable: false に新カテゴリ追加時は `use-<newrole>-*` で拡張可能

## Negative Consequences

- 命名長化 (`use-context-reviewer-silence` は 35 文字)
- ADR-0053 Option 2 却下理由との矛盾 (本 ADR で semantic 再定義により解消)
- 24 時間以内に 3 ADR を supersede する設計揺らぎ
- 16 skill 再改名 + marketplace.json 破壊的変更 (2 段階目)
- 既存 `use-git` 等の 2-segment 命名が破壊的に 3-segment 化 (distribution 済みなら既存 install 破壊)

## Scope

適用対象:

- `skills/` 16 ディレクトリ改名
- `.ja/skills/` ミラー改名
- 各 `SKILL.md` frontmatter `name:` 更新
- `agents/**/*.md` の `skills:` 配列更新
- 各 skill 内部の相互参照更新
- `.claude-plugin/marketplace.json` の path 更新
- `rules/conventions/SKILLS.md`, `rules/workflows/MODULARIZATION.md`, `rules/development/TOOLS.md` の命名 table 更新
- `docs/SKILLS_AGENTS.md`, `docs/COMMANDS.md` の言及更新
- `MEMORY.md` の言及更新
- ADR-0052/0053/0054 の Status を "superseded by 0055" に更新

対象外:

- user-invocable: true skill (short name 維持)
- generator 系 (commit/checkout/pr/issue) (ADR-0048 scope)

## Migration Strategy

1. ADR-0055 作成 (本 ADR)
2. ADR-0052/0053/0054 の Status を `superseded by 0055` に更新
3. `skills/` 16 ディレクトリ改名 (`git mv` で history 保持)
4. `.ja/skills/` ミラー改名
5. 各 `SKILL.md` frontmatter `name:` 更新
6. `agents/**/*.md` の `skills:` 配列更新
7. skill 内部の相互参照更新
8. `.claude-plugin/marketplace.json` path 更新
9. rules / docs 更新
10. `MEMORY.md` 更新
11. 全体 grep で旧名残存ゼロ確認

## Rollback Plan

Trigger Conditions:

- 3-segment 命名が冗長すぎて LLM discovery 精度劣化
- user が再度 3-prefix 分離に戻したい意向
- 命名長が harness/tool 制約に抵触

Rollback Steps:

1. git revert で rename 戻す (ADR-0052/0053/0054 の状態に復帰)
2. 本 ADR Status を `superseded` に更新
3. 新 ADR で再変更の理由を記録

## Reassessment Triggers

- `use-<newrole>-*` で新カテゴリ追加が必要になった時
- Claude Code harness が skill namespace / grouping 機能を追加した時 (prefix 依存が冗長になる)
- LLM discovery accuracy の測定で 3-segment 命名の劣化が検出された時
- command autocomplete での表示幅制約が顕在化した時

## Related ADRs

- [ADR-0004: スキル中心アーキテクチャへの再構成](0004-skill-centric-architecture-restructuring.md) - skill 命名の上位方針
- [ADR-0048: Standardize generator skill structure](0048-standardize-generator-skill-structure.md) - generator 系 (本 ADR 対象外)
- [ADR-0049: Consolidate skill-to-skill wrapper pairs](0049-consolidate-skill-to-skill-wrapper-pairs.md) - user-invocable skill 側の統合
- [ADR-0052: Unify skill naming with use- prefix for CLI wrappers](0052-unify-skill-naming-with-use-prefix-for-cli-wrappers.md) - 本 ADR が supersede (`use-*` semantic を CLI wrapper 専用から統一 marker に拡張)
- [ADR-0053: Adopt ctx- prefix for agent-only skills](0053-adopt-ctx-prefix-for-agent-only-skills.md) - 本 ADR が supersede (`ctx-*` → `use-context-*`)
- [ADR-0054: Adopt workflow- prefix for workflow skills](0054-adopt-workflow-prefix-for-workflow-skills.md) - 本 ADR が supersede (`workflow-*` → `use-workflow-*`)

---

_Created: 2026-04-24_
_Author: thkt_
_ADR Number: 0055_
