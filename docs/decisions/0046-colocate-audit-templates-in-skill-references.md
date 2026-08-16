---
status: "accepted"
date: 2026-04-20
decision-makers: thkt
---

# Colocate audit assets under skills/audit with references and templates split

## Context and Problem Statement

ADR 0042 で skill-specific scripts を skill 内に colocate する方針を採用した。同じ原則が `templates/audit/` 配下の 4 ファイルにも該当する。現状の配置と参照関係を棚卸しした結果:

| ファイル                  | 参照元                                                                |
| ------------------------- | --------------------------------------------------------------------- |
| `snapshot.yaml`           | `skills/audit/SKILL.md`, `agents/teams/team-integration.md` (EN + JA) |
| `output.md`               | `skills/audit/SKILL.md` (EN + JA)                                     |
| `calibration-examples.md` | 21 種全ての `agents/reviewers/*.md` (EN + JA)                         |
| `finding-schema.md`       | `skills/audit/references/pre-flight.md` (EN + JA)                     |

4 ファイル合計で約 50 ファイルから参照されるが、参照元は全て audit pipeline (skill + reviewer/integrator agents) 内で閉じている。他 skill からの利用はゼロ。ADR 0042 が指摘した「複数箇所で使用」が成立しない、`templates/audit/` 配下に templates 版が残るのは ADR 0042 の判断と非対称な状態。

## Decision Drivers

- Skill の可搬性: audit skill のディレクトリ単位で完結していれば移植が容易
- 凝集度: 同時変更される単位をディレクトリ境界で示す (Code Structure ルール: colocation)
- 発見容易性: audit skill を読む際、関連 template・schema が同階層にあるとたどりやすい
- ADR 0042 の前提との整合: 「複数箇所で使用」が実測でゼロ、scripts と同じ前提崩壊
- ADR 0044 の精神との整合: stateful 複雑さは empirical 証拠なしに避ける。今回は形式無変更の位置移動のみ、runtime 挙動に影響を与えない

## Considered Options

### Option 1: Skill 内で役割別に分離 (採用)

`templates/audit/*` を audit skill 内に移動する際、性格で 2 ディレクトリに分ける:

- `skills/audit/references/` - 読み物（procedure, calibration, schema）
  - `pre-flight.md` (既存)
  - `calibration-examples.md`
  - `finding-schema.md`
- `skills/audit/templates/` - fill-in 雛形
  - `snapshot.yaml`
  - `output.md`

参照元 50 ファイルのパスを一括書き換え。`templates/audit/` ディレクトリは削除。

- Good: ADR 0042 の筋を同種 assets に延長。一貫性確保
- Good: audit skill が自己完結し、skill 単位での移植が可能に
- Good: 形式無変更のため runtime 挙動に影響なし (ADR 0044 の精神と整合)
- Good: references (読み物) と templates (雛形) が性格で分離され、LLM が用途を識別しやすい
- Bad: 50 ファイルの一括パス書き換えが必要 (機械的作業だが規模あり)
- Bad: ディレクトリが 1 個増える（でも意味論が明確になる）

### Option 2: `templates/audit/` を維持

現状の templates 配下を続ける。

- Good: 参照元変更が不要
- Bad: ADR 0042 と判断が非対称 (scripts は skill 内、templates は共有)
- Bad: 他 skill からの参照が発生する想定が実測ゼロ (YAGNI 違反)

### Option 3: `templates/` 全体を各 skill 内 references に分散

全 `templates/*` を各 skill に colocate する大規模変更。

- Good: 方針を完全統一
- Bad: 本 ADR の scope を超える。他 skill の templates は利用状況別に判断すべき
- Bad: 今回のタスクを肥大化させる

## Decision Outcome

Chosen option: Option 1, because 実際の参照関係が audit skill + その内部 agents に閉じており、ADR 0042 と同じ前提（共有配置の必要性ゼロ）が成立しているため。形式は変更せず位置のみ移動するため runtime 挙動に影響を与えず、reversible な変更に留まる。

### Positive Consequences

- `skills/audit/` ディレクトリが audit pipeline の全 assets を保有する自己完結形へ
- ADR 0042 と同じ原則が adjacent な assets にも適用され、方針に一貫性
- `templates/audit/` が消えることで `templates/` 配下が他 skill の汎用 templates に絞られる

### Negative Consequences

- 50 ファイルのパス書き換えが必要（一括作業だがレビュー負荷あり）
- 他 skill から audit の finding-schema 等を参照したくなった場合、再度 shared 配置への移動が必要
- ADR 0042 と 0046 の関係を把握しないと方針が不明瞭

## Out of Scope

Out of scope items are tracked separately to avoid scope creep:

- snapshot.yaml / output.md の形式再設計 (snapshot と output の統合可否、YAML vs Markdown、canonical source 決定) は別 ADR で扱う
- runtime 側で template schema を enforce する強化策は別 ADR で扱う
- 他 skill の `templates/*` 配下 assets の colocate 判断は別途各 skill で判断する

## Current Process vs New Process

| Aspect        | Before                                         | After                                                                    |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| 配置          | `templates/audit/*`                            | `skills/audit/references/*` (読み物) + `skills/audit/templates/*` (雛形) |
| 参照パス      | `templates/audit/snapshot.yaml` 等             | `templates/snapshot.yaml` / `references/calibration-examples.md` 等      |
| スコープ      | `templates/` 直下で共有扱い                    | audit skill 内で閉じる                                                   |
| 役割分離      | なし（全部同居）                               | references = 読み物、templates = fill-in 雛形                            |
| ADR 0042 整合 | scripts は skill 内、templates は共有 (非対称) | scripts も assets も skill 内 (対称)                                     |

## Rollback Plan

Trigger Conditions:

- 他 skill が audit の finding-schema.md / calibration-examples.md / snapshot.yaml / output.md を参照する必要が発生した

Rollback Steps:

1. 対象ファイルを `templates/shared-audit-assets/` または適切な shared 位置に移動
2. audit skill + reviewer/integrator agents の参照を更新
3. 新規 ADR で shared 配置への回帰と理由を記録

## Reassessment Triggers

- 他 skill (例: `/polish`, `/verify`) が audit の finding-schema 等を参照する必要が発生した時
- hooks や外部スクリプトから audit templates を読み込む要件が発生した時

## Related ADRs

- [ADR 0042: Colocate Skill-Specific Scripts Within Skill Directory](0042-colocate-skill-specific-scripts-within-skill.md) - 同原則の scripts 版
- [ADR 0044: Reject snapshot-aware audit pipeline](0044-reject-snapshot-aware-audit-pipeline.md) - 形式変更を伴わない位置移動のみである点でこの判断と整合

---

_Created: 2026-04-20_
_Author: thkt_
_ADR Number: 0046_
