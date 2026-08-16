---
status: "proposed"
date: 2026-04-13
---

# ADR-0038: hook pipelineに stencils を追加しコードパターンをカタログ化する

- Context: stencils SOW/Spec (workspace/planning/2026-04-13-stencils/)

---

## Context and Problem Statement

hook pipeline（shields / guardrails / formatter / reviews / gates）は5ツールで構成されている。いずれもRust製でhomebrew-tap配布。

既存コードベースにパターンが暗黙的に存在し、エージェントの実装時に場当たり的な判断が発生する。ツール数増加（yomu / kiku / sae等）に伴い暗黙知の管理コストが増大しており、パターンドリフトが静かに蓄積している。

TOOLS.mdのrecall+yomuトリガー（Module first contact）がDiscovery機能を持つが、抽出・構造化・命名はされていない。

## Decision Drivers

- パターンが暗黙的で、逸脱理由が記録されない（後から考古学が必要）
- LLMにコードベース全体を毎回読ませるのはトークン効率が悪い（濃度の問題）
- hook pipelineの既存契約（PostToolUse stdin JSON、exit 0、silent）に乗れる
- tree-sitterの実績がyomuにある（TS + Rust共通）

## Considered Options

### A. stencils - tree-sitter静的解析 + PostToolUse hook

Rust CLIでTS/Rustコードをtree-sitter解析し、パターン頻度をカタログ化。hookで差分更新、CLIでフルスキャン。LLMは命名提案のみ、WHYは人間記述。

- Good: 決定論的。LLM不要で検出精度が安定
- Good: 既存hook契約（gates互換）に乗れる
- Good: カタログがgit管理され、grep + git blameで追跡可能
- Bad: 6本目のhookでパイプライン複雑度が増す
- Bad: 言語追加ごとにスキャナ実装が必要

### B. LLMベースのパターン抽出（エージェントスキル）

スキルとしてLLMにコードを読ませ、パターンを抽出・命名・分類させる。

- Good: 言語非依存。新言語のスキャナ実装不要
- Good: 文脈を理解した命名が可能
- Bad: 非決定論的。同じ入力で結果が変わる
- Bad: トークンコスト。毎回コードベースを読む必要がある
- Bad: NFR-003（冪等性）を満たせない

### C. 現状維持（recall + yomu のModule first contactトリガー）

TOOLS.mdの既存トリガーでモジュール初回接触時にrecall + yomuを並列実行。

- Good: 追加ツール不要
- Good: パイプライン複雑度が増えない
- Bad: 抽出・構造化・命名がされない（濃度が低い）
- Bad: パターンドリフトを検知できない
- Bad: 逸脱記録の仕組みがない

## Decision Outcome

Chosen option: A（stencils）。静的解析の決定論的な検出がカタログの信頼性を担保する。LLMは命名提案のみに限定し、WHYは人間が記述する。

カタログ設計はボルヘスの地図の寓話に従い、出力はname / dominant / location（代表1箇所）/ whyの4項目のみ。頻度はdominant計算の内部値として保持し、カタログには含めない。

### Positive Consequences

- 命名されたパターンカタログがgit管理下に存在し、実装判断の根拠になる
- `// Pattern-Deviation: X (reason: Y)` コメントでgrepと追跡が可能
- drift検知（逸脱数 ≥ dominant出現数）でカタログ更新の義務が発生する自己改善ループ

### Negative Consequences

- hook pipelineが6本に増え、PostToolUse発火時の処理が1つ増える
- TS/Rust以外の言語サポートには個別スキャナ実装が必要

## Architecture Diagram

```text
PostToolUse (Write/Edit)
  ├── formatter   (auto-fix)
  ├── reviews     (advisory)
  ├── gates       (lint/type/test gate)
  └── stencils    (pattern catalog update)  ← NEW

CLI
  stencils scan     → catalog.yaml (全ファイル)
  stencils status   → パターン総数 + drift候補
  stencils name     → LLM命名プロンプト出力
```

## Quality Attributes

| Attribute   | Priority | Approach                                            |
| ----------- | -------- | --------------------------------------------------- |
| Determinism | High     | tree-sitter AST解析。LLMを検出に使わない            |
| Fail-open   | High     | hook modeは常にexit 0。エージェントをブロックしない |
| Idempotency | High     | 同一入力で同一出力（NFR-003）                       |
| Performance | Medium   | hook: 2秒以内（単一ファイル）。scan: 30秒以内       |

## Trade-offs

- パイプライン複雑度（6本）と引き換えに、パターンの明示化と追跡可能性を得る
- 言語ごとのスキャナ実装コストと引き換えに、検出の決定論性を得る

## Implementation Guidelines

- 参照実装: yomu（tree-sitter）、gates（hook I/O）、sae（CLI構成）
- カタログ: `{project}/.claude/patterns/catalog.yaml`
- コメント規約: `// Pattern: X` / `// Pattern-Deviation: X (reason: Y)`
- homebrew-tap配布（既存パイプラインと同じ）

## References

- SOW: workspace/planning/2026-04-13-stencils/sow.md
- Spec: workspace/planning/2026-04-13-stencils/spec.md
- gates（hook I/O参照実装）: ~/GitHub/cli/gates/

## Reassessment Triggers

- hook pipelineの合計実行時間がPostToolUse発火ごとに5秒を超えた場合
- カタログの命名率が6ヶ月経過後も20%未満の場合（運用されていない兆候）
- tree-sitter以外の解析手法（例: LSP）がより適切と判明した場合
