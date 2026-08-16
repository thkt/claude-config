---
status: "accepted"
date: 2026-04-21
decision-makers: thkt
---

# ADR-0049: Consolidate skill-to-skill wrapper pairs

ADR-0042 の precedent と同じ論理

## Context and Problem Statement

ADR-0004 §4 は全コマンドを「薄いラッパー + 知識ベース」構造に統一する方針を決めた。
運用後の棚卸しで skill-to-skill wrapper ペアの caller 数を実測:

| Impl skill                     | Caller (wrapper 以外)       |
| ------------------------------ | --------------------------- |
| creating-adrs                  | なし (skills/adr のみ)      |
| extracting-ubiquitous-language | なし (skills/glossary のみ) |
| screening-pr-review            | なし (skills/preview のみ)  |

「複数 wrapper から共有される」前提が3組とも成立してない。ADR-0042 が scripts に対して下した判断（caller=1 なら colocate）と同じ構造。

加えて `user-invocable: false` でも Skill tool の visibility は消えず、LLM は wrapper と impl 両方を見る。分離の discoverability 上のメリットが無く、ノイズだけ残る。

## Decision Drivers

- ADR-0042 precedent の適用: caller=1 → colocate
- LLM 認知ノイズ削減: 6 entries → 3 entries
- Lookup 削減: wrapper → impl の 2段参照を 1段に
- allowed-tools の明示化: wrapper 側で必要 tool を宣言
- 対象の限定: skill-to-skill のみ、skill-to-agent (generator 系) は別パターン

## Considered Options

### Option 1: 3組とも統合 (採用)

`adr`, `glossary`, `preview` の各 wrapper skill に impl skill の内容をマージ。impl ディレクトリは削除。

- Good: ADR-0042 の論理を skill レベルに一貫適用
- Good: Skill list のノイズ削減
- Good: 各 wrapper の allowed-tools が impl 相当に拡張され、意図が明示
- Bad: user-facing skill が Bash/Task を持つ (security surface 拡大、pinned path)

### Option 2: 現状維持

- Good: 追加コスト無し、将来 2nd caller への保険
- Bad: YAGNI 違反 (caller=1 が3組とも empirical 確定)
- Bad: LLM ノイズ残存

### Option 3: Skill-to-agent 系も含めて統合

generator 系 (commit/checkout/pr/issue) も wrapper 撤回。

- Bad: subagent spawn が load-bearing (fresh context, isolated tools)
- Bad: ADR-0048 と衝突 (generator 構造統一の前提を崩す)
- Bad: scope 拡大で失敗時の rollback 困難

## Decision Outcome

Chosen option: Option 1。理由は ADR-0042 と同じ「複数箇所で使用の前提が empirical に成立しない」パターンで、3組とも caller=1 が確定しているため。

### Positive Consequences

- Skill tool visibility の entries が 6 → 3 に減
- wrapper/impl 間の意味境界の保守負担が消える
- ADR-0042 の論理を skill レベルにも展開

### Negative Consequences

- 3 wrapper の allowed-tools が拡大 (Bash pinned paths + Task)
- 将来 2nd caller 出現時に再分離コスト
- docs/SKILLS_AGENTS.md, marketplace.json, .ja/ ミラーなど参照更新コスト

### Scripts Path Supersession

ADR-0042 で `skills/creating-adrs/scripts/` に配置された 8 スクリプト (`next-adr-number.sh`, `slugify.sh`, `select-adr-template.sh`, `pre-check.sh`, `update-index.sh`, `validate-adr.sh`, `validate-markdown.sh`, `colors.sh`) は、本 ADR の統合に伴い `skills/adr/scripts/` に移動する。ADR-0042 の「caller=1 → colocate」原則は skill 統合後も維持される (単一 skill 内自己完結)。skill の `allowed-tools` の Bash glob も新パスに更新済み。

## Scope

適用対象:

- adr / creating-adrs
- glossary / extracting-ubiquitous-language
- preview / screening-pr-review

対象外:

- ADR-0048 で扱う generator 系 (commit/checkout/pr/issue) - subagent spawn パターン
- reviewing-* / *-reviewer - skill + agent の役割別ケース (ADR-0048 scope と別)

## Rollback Plan

Trigger Conditions:

- 2つ目以上の wrapper が同じ impl を参照する状況が発生
- 統合後の SKILL.md が 500 lines を超過 (SKILLS.md 準拠閾値)

Rollback Steps:

1. 該当 skill を `{wrapper}` + `{impl}` に再分割
2. impl 側を user-invocable: false に戻す
3. 新 ADR で再分離の理由を記録

## Reassessment Triggers

- 薄いラッパー原則を他のペア (reviewing-*/reviewer 含む) に拡張検討する時
- Claude Code harness が skill discovery の visibility 制御を変更した時

## Related ADRs

- [ADR-0004: スキル中心アーキテクチャへの再構成](0004-skill-centric-architecture-restructuring.md) - §4 を部分 supersede
- [ADR-0042: Colocate Skill-Specific Scripts Within Skill Directory](0042-colocate-skill-specific-scripts-within-skill.md) - 同じ「caller=1 → colocate」論理
- [ADR-0048: Standardize generator skill structure](0048-standardize-generator-skill-structure.md) - skill-to-agent パターン (本 ADR 対象外)
- [ADR-0050: Consolidate /fix via skill delegation; retire fix-workflow.md](0050-consolidate-fix-via-skill-delegation.md) - 本 ADR の論理を caller=0 case に拡張

---

_Created: 2026-04-21_
_Author: thkt_
_ADR Number: 0049_
