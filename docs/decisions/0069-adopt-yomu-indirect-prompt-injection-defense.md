---
status: "accepted"
date: 2026-05-19
decision-makers: thkt
---

# Adopt Indirect Prompt Injection Defense Design for yomu

## Context and Problem Statement

yomu の search / brief 結果は AI エージェント (Claude Code 等) の LLM コンテキストに直接投入される。任意リポジトリの chunk content には攻撃者が injection 指示を仕込める (依存ライブラリのコメント / OSS PR レビュー対象 / 外部 Issue tracker / Wiki スニペットの 3 経路)。OWASP LLM01:2025 該当の構造リスク。詳細は Threat Model (Phase 1 成果物、`~/GitHub/cli/yomu/.claude/workspace/planning/2026-05-19-indirect-prompt-injection-defense/threat-model.md`) を参照。

## Decision Drivers

- OWASP LLM01:2025 (Indirect Prompt Injection) の構造リスク対応
- yomu の Outcome 不変性 (素材を返すまでが yomu の責任)
- ローカル個人利用前提 (user base = thkt) で過剰実装を避ける (YAGNI)
- 単一バイナリ・依存ゼロ Constraint
- 既存 consumer 契約 (JSON 出力 schema) を破壊しない

## Considered Options

- Option A: Inline schema extension + 1 ADR
- Option B: Separate trust table + multi-ADR (5 本柱を分散)
- Option C: Search-time detection (検出 latency 影響)

## Decision Outcome

Chosen option: Option A (Inline schema extension + 1 ADR)。境界を「素材 + マーカーまで」に固定し、検出は index 時に集約。schema は additive optional で既存 consumer 契約を保つ。

### 5 本柱の採否

| #   | Pillar                               | Status                             | 根拠                                                                          |
| --- | ------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| 1   | データソース信頼性検証 (vendor 除外) | adopted (opt-in flag, default off) | 境界違反を避ける。walker は既に `.gitignore` 尊重済みで追加コストは flag のみ |
| 2   | コンテンツサニタイズ (rewrite)       | rejected                           | 境界違反 (yomu が素材を改変するため)                                          |
| 3   | tainted marker / fence               | adopted (中核)                     | 境界そのもの。per-chunk `injection_flags` で表現                              |
| 4   | injection 検出 warning               | adopted (3 と同層、補強)           | per-chunk marker の一種                                                       |
| 5   | Evidence Gate (score threshold)      | rejected                           | 境界違反 (yomu が結果をブロック)。consumer が flag と score で threshold する |

### Schema 設計

chunks テーブル schema version 9 で 2 column 追加 (additive ALTER ADD COLUMN):

| Column            | 型   | 意味                                                                                                                                                                                             |
| ----------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `source_kind`     | TEXT | chunk 起源 (vendor / test / src) の DB-side text representation。Rust 側は `SourceKind` enum (closed set, `as_str` / `from_db` で boundary 変換)。stringly-typed の解消は yomu issue #212 で実施 |
| `injection_flags` | TEXT | matcher の per-chunk 検出結果 (JSON 配列文字列、NULL は matcher 未走行)                                                                                                                          |

JSON 出力で 2 field 追加 (additive optional):

| Field             | 位置               | 型                  | serde 属性                                           |
| ----------------- | ------------------ | ------------------- | ---------------------------------------------------- |
| `injection_flags` | per-chunk          | `Option<Vec<&str>>` | `skip_serializing_if = "Option::is_none"`、`default` |
| `injection_check` | response top-level | enum sentinel       | 必須。3 値: `ran`、`skipped`、`unavailable`          |

silent-default-false の罠 (空配列 `[]` が「検査済みクリーン」と誤読される) を構造的に排除する。`injection_flags` の field 不在 = matcher 未走行、空 Vec = matcher 走行 + ヒットなし、Some Vec = matcher 走行 + ヒット。`injection_check` sentinel は response 単位で matcher 状態を 1 箇所に集約し、consumer が「matcher 未走行の chunk を LLM 投入してはならない」契約を実装できる。

### Migration

schema version 8 から 9 への migration code は書かない。schema version mismatch を検出した時点で chunks テーブルを drop して全 reindex を強制する。yomu は user base = thkt 1 人のローカル個人利用 CLI のため、migration ロジックの維持コストが ROI に見合わない。

### False positive policy

Consumer responsibility。yomu は raw matches を per-flag severity と共に返し、consumer が自身の threat model に応じて threshold を作る。FP whitelist は consumer 側で管理 (yomu には置かない)。yomu corpus の成長ポリシーは false-negative cost が false-positive cost を上回る場合のみ追加とし、evidence-based の追加を強制する。

### Consequences

- Good, 境界が schema 設計で構造的に固定される (silent-default-false 罠を排除)
- Good, walker は既存の `.gitignore` 尊重をそのまま利用、pillar 1 は flag 追加のみで成立
- Good, ADR 1 本で 5 pillars と未決論点を集約、kiku retrofit 議論も統一視点で扱える
- Good, OUTCOME.md Behavior 拡張で責任境界の不変性を git 履歴で可視化、ADR の Decision 単体では境界がスライドしないよう保護
- Bad, schema v9 への遷移で全 chunk の reindex を強制 (個人利用前提なので許容、ただし future user base 拡大時に migration 戦略の再評価が要る)
- Bad, kiku が同根対応する際、yomu/tests/fixtures/injection/ を借りるか独自で持つかは kiku 側の判断に委ねる (yomu からは amici 抽出を急がない)
- Bad, OUTCOME.md Behavior 拡張は、将来 default を「filter on」に変更したくなった場合に強い制約として残る

### Confirmation

以下のいずれかが発生した時点で本 ADR を再評価する:

- 4 updates per quarter を超える corpus 更新が定常化した場合 (release lockstep policy の見直し)
- yomu の user base exceeding 1 になった場合 (CI / cross-tenant scope の格上げ、migration 戦略の再評価)
- new pillar 候補が emerging した場合 (5 本柱 + Evidence Gate を超える対策が必要となった時)

## Pros and Cons of the Options

### Option A: Inline schema extension + 1 ADR

- Good, additive optional field で既存 consumer 契約を維持
- Good, ADR 1 本で 5 pillars と未決論点を集約、relationship を保持
- Good, kiku retrofit の path を Consequences で扱える
- Bad, schema v9 遷移で reindex が必要 (個人利用前提なので許容)
- Bad, schema 拡張は将来 column 追加コストを yomu が引き受ける

### Option B: Separate trust table + multi-ADR

- Good, 既存 chunks テーブル維持、migration 不要
- Good, ADR を pillar ごとに分散して独立意思決定
- Bad, consumer 側で 2 query 必要、契約が複雑化
- Bad, 5 ADR で relationship が分散、横串の rationale が消える

### Option C: Search-time detection

- Good, corpus 更新が即反映
- Good, schema 変更不要
- Bad, search / brief の latency に毎回 matcher コストが乗る
- Bad, OUTCOME.md Indicator (`index ~2.5s` 維持) と衝突 (latency 増)

## More Information

### 未決論点の意思決定

| #   | 論点                        | 決定                                                                          |
| --- | --------------------------- | ----------------------------------------------------------------------------- |
| 1   | v9 migration の有無         | migration コードは書かない (schema mismatch 時に drop + reindex 強制)         |
| 2   | yomu DB at-rest 暗号化      | consumer responsibility (FS 暗号化に依存、yomu 側で SQLCipher 等を導入しない) |
| 3   | CI 実行下の脅威モデル       | out of scope (ローカル個人利用前提)                                           |
| 4   | Cross-tenant DB pollution   | out of scope (project root 内 `.yomu/index.db` で閉じている)                  |
| 5   | Embedding vector poisoning  | out of scope (Evidence Gate 議論は別 Issue)                                   |
| 6   | Corpus update release cycle | yomu コードと lockstep (個人利用で release 管理は thkt が一本化)              |

### kiku retrofit の path

kiku が同根対応する際の corpus 共有判断は kiku 側の Issue に委ねる。yomu ADR としては「将来 kiku が yomu corpus を借りる選択肢を残すが、yomu 側から amici 抽出を急がない」と立場を明示する。amici 抽出は corpus が 2 つ目の consumer を持った時点で再評価する。

### Out-of-scope の合意根拠

CI / cross-tenant / embedding poisoning を out of scope と判定した根拠は Threat Model の「Out of scope」セクションに記述。各 entry は復帰条件 (例: user base 拡大、worktree 共有キャッシュ導入、Evidence Gate default on) を持ち、Confirmation Trigger と連動する。

### Related boundary statement

責任境界の不変性は ADR Decision Outcome だけでは将来の default 変更で滑る可能性がある。OUTCOME.md の Behavior に bullet として明記し、変更には OUTCOME.md 編集を必要とする (git 履歴で境界変更が可視化される)。

### References

- yomu Issue [#154](https://github.com/thkt/yomu/issues/154)
- Threat Model: `~/GitHub/cli/yomu/.claude/workspace/planning/2026-05-19-indirect-prompt-injection-defense/threat-model.md`
- SOW / Spec / Approaches: 同ディレクトリ配下
- OUTCOME.md: `~/GitHub/cli/yomu/.claude/OUTCOME.md` (Behavior 拡張済み、本 ADR と同 commit cycle)
- OWASP LLM01:2025 Prompt Injection (<https://owasp.org/www-project-top-10-for-large-language-model-applications/>)
- OWASP 2025 新規: Vector and Embedding Weaknesses
- ADR-0060: Adopt Agent-Friendly CLI Design Principles
