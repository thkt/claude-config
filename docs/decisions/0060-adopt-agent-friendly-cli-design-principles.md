---
status: "accepted"
date: 2026-05-03
decision-makers: thkt
---

# Adopt Agent-Friendly CLI Design Principles

## Context and Problem Statement

自作 Rust CLI 群 (yomu, recall, sae, kiku, tally, scout, mado 等) は AI エージェントから呼ばれる頻度が増えている。人間 UI 想定の出力・エラー設計だと、エージェントの試行回数が増えて context window を圧迫する。新規 CLI と既存 CLI 改修の両方で、共通の設計原則をどう敷くか。

## Decision Drivers

- エージェントの試行コスト最小化 (パース失敗・リトライ判断不能を減らす)
- 既存 CLI の良い実装 (yomu, recall, sae) を再利用しやすい形で標準化する
- 全原則一気導入の重さを避け、優先度を持たせた段階導入にする

## Considered Options

- Option A. Zenn 記事の 8 原則すべてを必須化
- Option B. 3 軸 + 補強パターン + 将来課題の 3 層に分けて段階導入
- Option C. 現状維持、ツールごとに任意判断

## Decision Outcome

Chosen option: Option B (3 軸 + 補強 + 将来課題の段階導入)。エージェントが「予測 + 試行」で動く前提に応える 3 軸 (機械可読 / 次の手 / 自己発見) を必須化し、既存実装の良いパターンを補強として束ねる。投資対効果が最大。

### Consequences

- Good, 新規 CLI は 3 軸テンプレで開始できる。PR レビューのチェック観点が明確になる
- Good, 既存 CLI のギャップが可視化される (recall は JSON 出力欠落、yomu は exit code 未拡張、sae は `next_step` 欠落)
- Bad, 既存 CLI に改修コストが発生する。優先度はツール別に判断する必要がある

### Confirmation

新規 CLI は PR レビュー時に 3 軸 (機械可読 / 次の手 / 自己発見) を満たすかチェック。既存 CLI はツール別 improvement issue を切ってトラッキング。3 ツール以上が 3 軸を満たした時点で本 ADR の妥当性を再評価する。

## Pros and Cons of the Options

### Option A. 8 原則すべて必須化

- Good, 漏れなくカバーできる
- Bad, 既存 CLI の一気改修は重い。`describe` コマンド等は工数が大きい
- Bad, 全原則を同等扱いにすると優先度判断が消える

### Option B. 3 軸 + 補強 + 将来課題

- Good, 必須を絞ることで既存 CLI 改修の優先度が明確になる
- Good, yomu/recall/sae の良い実装を再利用するパターン集として機能する
- Bad, 3 軸の境界判断が必要 (新原則をどこに入れるか)

### Option C. 現状維持

- Good, 改修コストはゼロ
- Bad, ツール間の一貫性が失われ、エージェントの学習コストが増える

## More Information

### 3 軸 (必須実装)

| 軸       | 必須実装                                                                                 | 既存実装の参考                                                                                        |
| -------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 機械可読 | グローバル `--json` + serde 派生型 + stdout/stderr 分離                                  | yomu/src/main.rs:22 (`--json` global flag), sae/src/output.rs:6-8 (JSON/human 二系統で出力純度を保つ) |
| 次の手   | sysexits.h 準拠 exit code (0/64/65/66/74/75) + エラー JSON に `next_step` + `candidates` | sae/README.md:114-126 (sysexits 採用), recall/src/main.rs:594-606 (USER_ERROR_MARKERS で UE/SE 分離)  |
| 自己発見 | Noun-Verb (resource verb) + parse-time `conflicts_with` バリデーション                   | yomu/recall/sae 共通、yomu の `#[arg(conflicts_with = "from")]`                                       |

### 補強パターン (推奨実装)

| パターン                          | 出典                                                    | エージェント観点での効き                  |
| --------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| 構造化 degradation signal         | yomu (`degraded`/`notes` field), recall (FTS5 fallback) | 品質低下を JSON で検知、stderr 解析が不要 |
| BrokenPipe handling               | recall/src/main.rs:429-435                              | `\| head` `\| less` でクラッシュしない    |
| Shorthand expansion + safety rail | yomu (hint_arrow log), sae (OSA distance typo guard)    | 自動展開しつつ誤判定を回避                |
| stdin 統一 (`IsTerminal` + `-`)   | yomu/src/main.rs:32-34, sae                             | tty 期待のハングなし                      |
| `--dry-run` on mutating ops       | yomu, sae                                               | 副作用前の確認                            |

### 将来課題 (本 ADR では強制しない)

- `describe` コマンド (Zenn 記事 Principle 5) は全ツール未実装。新規 CLI から採用を検討
- エラー JSON の `next_step` / `candidates` (Principle 6) は新規実装で必須項目とする

### 外部規格との対応 (ISO/IEC 25010:2023)

2023 年改訂の製品品質モデルは旧 Usability を Interaction capability に再定義し、副特性を拡張した。本 ADR の 3 軸はエージェントを利用者と置いたときの Interaction capability の実装形に相当し、レビュー時の観点語彙として以下の対応を使う。

| 25010:2023 副特性                | 本 ADR での対応                                                              |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Self-descriptiveness (2023 新設) | 自己発見軸 (Noun-Verb, `conflicts_with`) + 将来課題の describe コマンド      |
| User error protection            | 次の手軸 (`next_step` / `candidates`) + safety rail 補強パターン             |
| Learnability                     | Noun-Verb 命名のツール間一貫性                                               |
| Operability                      | 機械可読軸 (`--json`, stdout/stderr 分離) + stdin 統一 + BrokenPipe handling |
| User assistance                  | エラー JSON の `next_step` (将来課題の必須化対象)                            |

Appropriateness recognizability / User engagement / Inclusivity は人間 UI 前提の副特性であり、エージェント利用者では判定対象にしない。

### Reassessment Triggers

- 既存 CLI 3 つ以上が 3 軸を満たした後、`describe` コマンドを必須に格上げ検討
- Claude Code / Codex 側で inputSchema 自動取得機構が普及した場合、`describe` の優先度を再評価
- sysexits.h 6 種類で不足が出た場合、16 種類フル準拠への拡張を検討

### References

- Source: <https://zenn.dev/assign/articles/b3d1d07d385b87>
- Standards: clig.dev, sysexits.h, MCP Tools spec
- Existing exemplars (audit 2026-05-03): yomu, recall, sae
