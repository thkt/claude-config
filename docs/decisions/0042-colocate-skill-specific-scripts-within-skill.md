---
status: "accepted"
date: 2026-04-20
decision-makers: thkt
---

# ADR-0042: Colocate Skill-Specific Scripts Within Skill Directory

## Context and Problem Statement

ADR-0006 では決定論的処理を `~/.claude/scripts/` に集約する方針を採用した。運用後、実際の参照関係を棚卸ししたところ、7 本あったスクリプトのうち:

- 3 本 (`next-adr-number.sh`, `slugify.sh`, `select-adr-template.sh`) は `skills/creating-adrs` からのみ参照
- 1 本 (`sync.sh`, `validate-config.sh`) は手動メンテナンス用途で廃止判定
- 2 本 (`find-config-root.sh`, `setup-sandbox.sh`) は参照ゼロで廃止判定

つまり「複数箇所で使用」を満たすスクリプトは結果として存在せず、ADR-0006 の前提（DRY 目的の共有配置）が成立していなかった。単一 skill が占有するスクリプトは skill 内に置いた方が凝集度が高く、skill 削除時の孤児ファイルも発生しない。

## Decision Drivers

- Skill の可搬性: skill ディレクトリ単位で完結していれば他環境への移植が容易
- 凝集度: 同時変更される単位をディレクトリ境界で示す (Code Structure ルール: colocation)
- 発見容易性: skill の実装を読む際、関連スクリプトが同階層にある方がたどりやすい
- ADR-0006 の前提の崩壊: 「複数箇所で使用」が実測でゼロ
- allowed-tools の安全性: skill の `Bash(... $HOME/.claude/skills/creating-adrs/scripts/*)` と整合

## Considered Options

### Option 1: Skill 内 scripts/ に colocate (採用)

`skills/creating-adrs/scripts/` に 3 スクリプトを移動。参照パスは相対 (`./scripts/`) またはフルパスに更新。`~/.claude/scripts/` ディレクトリは廃止。

- Good: skill 単位で自己完結
- Good: allowed-tools の glob と一致し、許可外呼び出しを防ぐ
- Good: skill 削除時にスクリプトも一緒に消える
- Bad: 将来複数 skill で再利用したくなった場合に再度外出しが必要

### Option 2: `~/.claude/scripts/` を維持

現状の共有配置を続ける。

- Good: 将来複数箇所で使う可能性に備える
- Bad: YAGNI 違反 (現在参照はゼロ)
- Bad: skill の allowed-tools と乖離した実行パスが残る
- Bad: 参照箇所と実体の距離が遠く、変更時の影響把握が困難

### Option 3: Shared package として別ディレクトリに整理

`~/.claude/shared/adr-scripts/` のような第三のディレクトリを新設。

- Good: shared の意図を明示
- Bad: 単一 skill 専用のため shared の命名と実態が不一致
- Bad: ディレクトリ階層が増えるだけで本質的な改善なし

## Decision Outcome

Chosen option: Option 1 (Skill 内 colocate), because 実際の参照関係が単一 skill に閉じており、共有配置の前提が成立していないため。将来 2 つ目の skill が同じスクリプトを必要とした場合は、その時点で shared 配置への再整理を検討する (YAGNI 境界)。

### Positive Consequences

- `~/.claude/` 直下が 1 ディレクトリ減ってフラット化
- skill ディレクトリが自己完結し移植可能に
- ADR-0006 で指摘された「AI プロンプト削減」効果は skill 内配置でも維持

### Negative Consequences

- 将来複数 skill で共有したくなった場合に再整理コスト発生
- ADR-0006 と ADR-0042 の関係を把握しないと方針が不明瞭

## Current Process vs New Process

| Aspect        | Before (ADR-0006)           | After (ADR-0042)                         |
| ------------- | --------------------------- | ---------------------------------------- |
| 配置          | `~/.claude/scripts/*.sh`    | `skills/creating-adrs/scripts/*.sh`      |
| 参照パス      | `$HOME/.claude/scripts/...` | `./scripts/...` または同ディレクトリ相対 |
| スコープ      | 全 skill から共有           | 単一 skill 内で閉じる                    |
| allowed-tools | 一致してないケースあり      | skill の glob と完全一致                 |

## Rollback Plan

**Trigger Conditions**:

- 2 つ以上の skill が同じスクリプトを必要とする状況が発生

**Rollback Steps**:

1. 該当スクリプトを `~/.claude/shared/` または別 skill の scripts に移動
2. 参照元の skill を更新
3. 新規 ADR を作成し、shared 配置に回帰した理由を記録

## Reassessment Triggers

- 2 つ目以降の skill が ADR 関連スクリプトを必要とした時
- skill 外 (hooks 等) からスクリプト呼び出しが必要になった時

## Related ADRs

- [ADR-0006: Adopt Deterministic Script Pattern](0006-adopt-deterministic-script-pattern.md) - 部分的にsupersede
- [ADR-0004: Skill-Centric Architecture Restructuring](0004-skill-centric-architecture-restructuring.md)

---

_Created: 2026-04-20_
_Author: thkt_
_ADR Number: 0042_
