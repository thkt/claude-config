---
status: Accepted
date: 2026-05-02
deciders: thkt
consulted: critic-design (DA), claude-code research agent
informed: future contributors
---

# Adopt Tier 3 lite GitHub label strategy across personal projects

## Context and Problem Statement

ヴィヴィッド（thkt）は約30本の個人 dev/tool リポジトリを GitHub org `thkt` 配下で運用している（CLI 22 + Apps public 1 + Plugins 3 + private dev 4）。各リポのラベル運用は以下の理由でドリフトしている。

- 一部リポは GitHub 標準9個のみ。yomu には `P1` `P2` `P3` `ci` `dependencies` `rust` の追加。kagami には `refactor-scout` のような独自ラベルが存在する
- リポ横断クエリ（`gh issue list --search 'org:thkt label:...'`）が成立せず、AI エージェント（Claude Code 等）からの構造化トラッキングが不能
- 新規リポ作成時、ラベルセットを手動で追加するコストが繰り返し発生

研究レポート `~/.claude/workspace/research/2026-05-02-github-issue-label-strategy.md` で 8 OSS（TypeScript, React, VS Code, Kubernetes, Rust, Next.js, Node.js, gh CLI）と GitHub 公式仕様を比較し、3 tier 戦略（Tier 1 = 標準のみ、Tier 2 = priority/area prefix、Tier 3 = automation + retirement）を導出した。

## Decision Drivers

- AI エージェント運用前提で、`gh issue list --label priority:* --label area:*` による構造化トラッキングを成立させる必要がある
- Solo maintainer のため、ラベル付与に 30 秒以上かかる仕組みは運用が破綻する
- 30 リポ規模で個別運用するとスキーマドリフトが累積する
- 過剰設計（YAGNI 違反）を避け、後からエスカレーション可能な構造を選ぶ
- DA レビューで「人力ラベリングは hygiene fall apart アンチパターン直撃」と指摘され、自動化が必須条件となった

## Considered Options

| Option                                                                      | 中身                                                   | 主な弱点                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| A. Tier 1（標準のみ + `priority:high`）                                     | GitHub 標準 9 個に最小限の追加                         | area filter 達成しない、Outcome 半分後退                                                                     |
| B. Tier 2（priority + area、人力ラベリング）                                | prefix 採用、Issue Forms 無し                          | Anti-Patterns Inventory「Label hygiene falls apart when humans are the only label source」直撃、Outcome 不達 |
| C. Tier 3 full（priority + area eager + effort + status full + automation） | レポート完全版                                         | effort/full status は YAGNI、area eager 棚卸しは K8s sprawl 再現                                             |
| D. Tier 3 lite（priority + area lazy + automation + status 1 個のみ）       | Tier 3 から effort・full status・eager area を引いた形 | "lite" 呼称が独自定義、CONTRIBUTING で差分明記必要                                                           |

| Sync mechanism Option                                  | 中身                                                              | 主な弱点                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| α. NPM `Micnews/github-label-sync`                     | YAML config、aliases、dry-run、unlisted-removal の 4 機能標準装備 | NPM 依存（GitHub Actions 上のみ）                                                |
| β. 自作 Rust CLI `obi`（octocrab + serde_yaml + clap） | Rust philosophy 整合、自分の CLI 群と統一感                       | 既存 OSS で全機能カバー可能、開発・保守工数が outcome に寄与しない（YAGNI 違反） |
| γ. `chevdor/glabel`（既存 Rust CLI）                   | Rust 製、cargo install                                            | aliases 未対応、メンテ弱、機能不足                                               |
| δ. `gh label` + Bash ループ                            | 依存最小、gh CLI のみ                                             | aliases 自前実装、削除順序の事故リスク                                           |

## Decision Outcome

選択: **D. Tier 3 lite + α. NPM `Micnews/github-label-sync`**

### Tier 3 lite の構成

| 項目             | 採用                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ベースラベル     | GitHub 標準 9 個残置                                                                                                           |
| 追加 prefix      | `priority:high` `priority:medium` `priority:low` + `area:<component>`（lazy）+ `status:in-progress`（Projects 棚卸し後再評価） |
| separator        | `:`                                                                                                                            |
| 命名             | lowercase + kebab-case                                                                                                         |
| 色規律           | 1 prefix 1 色、priority のみ赤→橙→黄グラデ                                                                                     |
| Sync             | Leader repo `thkt/github-labels` + NPM `github-label-sync` を GitHub Actions matrix で実行                                     |
| Auto-label       | Issue Forms + `stefanbuck/advanced-issue-labeler`                                                                              |
| area enumeration | B 方式（lazy）、リポ毎 opt-in、最初は priority のみ運用                                                                        |
| Migration        | 段階適用（1 → 5 → 残り）、`unlisted-label removal` は最低 2 週間オフ                                                           |
| Dependabot 共存  | `dependencies` `ci` `rust` を preserve list として明示                                                                         |
| Private sync     | fine-grained PAT 90 日、毎週 monitor workflow                                                                                  |
| 失敗監視         | matrix `fail-fast: false` + 集約 job + 失敗時 issue 自動作成                                                                   |
| Retirement       | 四半期退役（zero applied issues 6 ヶ月）                                                                                       |

### "lite" の差分定義

- Tier 3 full から `effort:*` を削除（Solo で見積もり不要）
- Tier 3 full の status full 運用 → `status:in-progress` 1 個のみ（GitHub Projects 採用棚卸し後に判断）
- Tier 3 full の area eager enumeration → lazy（リポ毎 opt-in）

### Consequences

良い結果:

- AI エージェントから構造化されたクエリが 30 リポ横断で成立する
- 新規リポは `target_repos.txt` に追加するだけで全ラベルが自動 sync される
- alias 機能により既存ラベル（P1 → priority:high 等）の名前変更時に issue 履歴が維持される
- Issue Forms により人力ラベリングのバラつきが解消される

悪い結果:

- Issue Forms を 30 リポに配備する初期コストが発生（priority dropdown は共通化、area はリポ毎）
- NPM 依存が発生（GitHub Actions 内に閉じるが、Rust エコシステム純度は下がる）
- 「Tier 3 lite」呼称が独自定義のため、第三者が見たらレポート Tier 3 と混同するリスク

中立:

- Solo maintainer の責務範囲は変わらない（GitHub Actions が大半を吸収）
- private repo 4 本は fine-grained PAT 経由で sync、期限管理が必要

## More Information

| 関連ドキュメント   | パス                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| 研究レポート       | `~/.claude/workspace/research/2026-05-02-github-issue-label-strategy.md` |
| SOW                | `~/.claude/workspace/planning/2026-05-02-label-strategy/sow.md`          |
| Spec               | `~/.claude/workspace/planning/2026-05-02-label-strategy/spec.md`         |
| Anti-Patterns 出典 | 上記研究レポートの Anti-Patterns Inventory                               |

### Pros and Cons of Reference Tools

`Micnews/github-label-sync`

- Pros: aliases、dry-run、unlisted-removal が標準装備、5 年運用で安定、設定は YAML 1 ファイル
- Cons: NPM 依存（actions/setup-node 必要）、メンテナ Micnews が他に活発でない

`stefanbuck/advanced-issue-labeler`

- Pros: Issue Forms ネイティブ統合、`.github/advanced-issue-labeler.yml` 1 ファイルで設定、active maintained
- Cons: form ID と label 名のマッピングを正確に書く必要、誤設定時のフィードバックが弱い

自作 `obi`（却下）

- Pros: Rust philosophy 整合、自分の CLI 群と統一感
- Cons: 既存 OSS で全機能カバー可能、開発・保守工数が outcome に寄与しない、DA で「Rust 理由は工数を奪う言い訳」と指摘

### Reassessment Triggers

- 45 ラベル必要だったと判明し、Tier 2 へエスカレーションする段になったとき
- github-label-sync の自動 sync が止まり、30 リポでスキーマドリフトが再発したとき
