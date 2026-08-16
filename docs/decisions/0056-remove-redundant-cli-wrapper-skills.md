---
status: "accepted"
date: 2026-04-29
decision-makers: thkt
---

# ADR-0056: Remove redundant CLI wrapper skills (use-cli-git/gh/npm)

## Context and Problem Statement

ADR-0055 (2026-04-24) で `use-cli-*` を user-invocable: false 統一 marker として 8 skill を `u` セクションに集約した。本 ADR ではそのうち 3 skill (`use-cli-git`, `use-cli-gh`, `use-cli-npm`) を削除する。

監査結果 (2026-04-29):

| 項目                          | 結果                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| agents/ からの skill 配列参照 | ゼロ                                                                                                 |
| commands/ からの参照          | ゼロ                                                                                                 |
| 他 skill からの相互参照       | ゼロ                                                                                                 |
| references/ の内容            | git/gh/npm の generic best practice (HEREDOC commit, conventional commits, gh PR/issue, npm scripts) |
| Claude 標準知識との差分       | ほぼなし。Claude Code system prompt にも HEREDOC commit 例あり                                       |
| 合計行数                      | 545 lines (4 reference files)                                                                        |

`use-cli-yomu`/`use-cli-recall`/`use-cli-scout`/`use-cli-gcloud`/`use-cli-heptabase` は CLI 固有の subcommand, environment variables, design rationale を含み load-bearing。一方 `use-cli-git`/`use-cli-gh`/`use-cli-npm` は標準コマンドの再録に留まる。

## Decision Drivers

- YAGNI: load-bearing でない knowledge は維持しない
- Context bloat 削減 (skill list の noise reduction)
- 標準知識との重複排除
- ADR-0055 の「統一 marker」一貫性 vs 必要最小限のトレードオフ

## Considered Options

### Option 1: 3 skill 削除 (採用)

`skills/use-cli-git/`, `skills/use-cli-gh/`, `skills/use-cli-npm/` および `.ja/skills/` ミラーを削除。`marketplace.json` から path 削除。`rules/` の例から該当言及を別 skill (`use-cli-yomu`) に置換。

- Good: load-bearing でない skill を排除 (YAGNI)
- Good: skill discovery list の noise 削減
- Good: Claude 標準知識との重複解消
- Bad: ADR-0055 の「8 skill 全集約」設計を 5 skill に縮小 (partial supersede)
- Bad: 一貫性指標としての「統一 marker」概念は維持されるが規模が縮小

### Option 2: references だけ削除して SKILL.md は空シェルで維持

- Good: 統一 marker 8 個維持
- Bad: 中身ゼロの skill を維持する意味がない
- Bad: skill discovery list で trigger keyword は残るので noise reduction にならない

### Option 3: 維持 (ADR-0055 の一貫性優先)

- Good: 設計揺らぎなし
- Bad: load-bearing でない 545 lines を保持
- Bad: skill discovery で git/gh/npm trigger が発火する可能性 (Claude 標準知識で済む場面)

## Decision Outcome

Chosen: Option 1。ADR-0055 の partial supersede として 3 skill を削除。残る 5 skill (`use-cli-yomu`, `use-cli-recall`, `use-cli-scout`, `use-cli-gcloud`, `use-cli-heptabase`) は CLI 固有の load-bearing knowledge を持つため維持。

ADR-0055 の「user-invocable: false 統一 marker」概念は維持。本 ADR で「統一 marker 配下に置く skill は load-bearing であること」を追加要件として確立する。

## Positive Consequences

- skills/ から 6 ディレクトリ (skills + .ja ミラー) と 545 lines を削減
- skill discovery list の noise 減少
- 「統一 marker」の運用基準が明確化 (load-bearing 必須)

## Negative Consequences

- ADR-0055 の「8 skill 全集約」が 5 skill に縮小 (一貫性スケール縮小)
- ADR-0055 採用から 5 日で partial supersede (設計揺らぎ)

## Scope

適用対象:

- `skills/use-cli-git/`, `skills/use-cli-gh/`, `skills/use-cli-npm/` 削除 (each: SKILL.md + references/)
- `.ja/skills/use-cli-git/`, `.ja/skills/use-cli-gh/`, `.ja/skills/use-cli-npm/` 削除
- `.claude-plugin/marketplace.json` から 3 skill path 削除
- `rules/conventions/SKILLS.md` 命名 table の例置換 (`use-cli-git` → `use-cli-yomu`)
- `rules/workflows/MODULARIZATION.md` 例置換 (同上)
- `MEMORY.md` (`feedback_skill-refactoring-policy.md`) の言及更新

対象外:

- 残り 5 つの `use-cli-*` skill (load-bearing のため維持)
- `use-workflow-*`, `use-context-*` (本 ADR scope 外)
- ADR-0055 の Status (partial supersede のため accepted のまま、Related ADRs に本 ADR 追記推奨)

## Migration Strategy

1. 本 ADR 作成
2. skill ディレクトリ削除 (skills/, .ja/skills/)
3. marketplace.json から path 削除
4. rules/ 2 ファイル例置換
5. memory feedback 更新
6. grep 全体走査で旧名残存ゼロ確認

## Rollback Plan

Trigger Conditions:

- 削除後に load-bearing が判明 (agent/command が trigger keyword 経由で参照していたケース)
- skill discovery accuracy 劣化の測定値

Rollback Steps:

1. git revert で復元
2. 本 ADR Status を `superseded` に更新

## Reassessment Triggers

- 残り 5 つの `use-cli-*` skill のいずれかも load-bearing でないと判明した時
- 「統一 marker」運用基準の見直しが必要になった時
- Claude Code harness が skill loading に変更を加えた時 (filter / namespace 機能等)

## Related ADRs

- [ADR-0052: Unify skill naming with use- prefix for CLI wrappers](0052-unify-skill-naming-with-use-prefix-for-cli-wrappers.md) - `use-cli-git/gh/npm` 命名の起源
- [ADR-0055: Consolidate user-invocable:false skills under unified use- prefix](0055-consolidate-user-invocable-false-skills-under-use-prefix.md) - 本 ADR が partial supersede

---

_Created: 2026-04-29_
_Author: thkt_
_ADR Number: 0056_
