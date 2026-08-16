---
status: "accepted"
date: 2026-04-21
decision-makers: thkt
---

# Adopt unified SKILL.md template for generator-class workflows

将来追加される generator の形は予測。固有ブロック許容で柔軟性は確保

## Context and Problem Statement

`commit`/`checkout`/`pr`/`issue` の 4 skill はすべて同じ
「generator agent 呼び出し → 候補提示 → 実行」パターンに従うが、
SKILL.md の命名・構造に揺れがある。棚卸し結果:

| 揺れ箇所             | commit                                | checkout          | pr         | issue              |
| -------------------- | ------------------------------------- | ----------------- | ---------- | ------------------ |
| Agent テーブル見出し | `## Task`(揺れ)                       | `## Agent`        | `## Agent` | `## Agent`         |
| Flow セクション      | `## Flow: Preview`                    | `## Flow: Select` | なし       | `## Flow: Preview` |
| 独自重複セクション   | `## Message Selection`(Step 2 と被る) | なし              | なし       | なし               |
| Rules セクション     | なし                                  | なし              | `## Rules` | なし               |

新規 generator skill 追加時に参照できる構造基準が無いため、
場当たり的に既存 skill を模倣する結果、揺れが再発する。
`rules/workflows/MODULARIZATION.md` は skill 全般の規約
（Thin Wrapper, ≤100 lines 等）を定めるが、
generator 系特化のセクション構成には踏み込んでいない。

## Decision Drivers

- LLM 可読性: SKILL.md の構造統一で解釈ブレを減らす
- 姉妹 skill 整合: `commit` だけ整理しても 4 つの統一が取れなければ意味が薄い
  (feedback: 全体統一 > 個別最適)
- 固有ブロック保持: `Sandbox-Compatible Commit` 等の load-bearing ブロックは
  skill 固有。汎用テンプレに閉じ込めない
- MODULARIZATION との整合: Thin Wrapper/≤100 lines/Reference Patterns を引き継ぐ
- 新規 generator 追加時の準拠基準: この ADR が判断記録として参照される

## Considered Options

### Option 1: 統一テンプレート + 固有ブロック許容 (採用)

generator 系 SKILL.md の必須セクションとオプショナルセクションを規定する。

必須（この順序）:

| #   | セクション               | 目的                                                              |
| --- | ------------------------ | ----------------------------------------------------------------- |
| 1   | frontmatter              | `allowed-tools`, `user-invocable: true`, `model`, `argument-hint` |
| 2   | `# /<name> - <短い説明>` | H1 見出し                                                         |
| 3   | 1〜2行の概要             | 一言で何をする skill か                                           |
| 4   | `## Input`               | `$1` の扱い、省略時の挙動                                         |
| 5   | `## Agent`               | 呼び出す generator agent の1行表（Type / Name / Purpose）         |
| 6   | `## Execution`           | Step テーブル（subagent_type 呼び出し → 候補提示 → 実行）         |
| 7   | `## Display Format`      | Preview / Success の表示形式                                      |
| 8   | `## Verification`        | セルフチェック（`subagent_type` が正しい等）                      |

オプショナル:

- `## Rules`: skill 固有制約がある場合（例: pr の「Title: No prefix」）
- 固有実行ブロック: H3 見出しで `## Execution` 直下に配置。命名は概念を端的に
  表す名前にする（既存例: `### Sandbox-Compatible Commit` in commit）
- `## <Feature>`: 条件付き追加機能（例: `## Visual Recording` in pr）

禁止:

- `## Flow: <X>` の 1 行フロー図（Execution テーブルで十分、冗長）
- Execution Step と内容が重複する独立セクション（例: `## Message Selection`）
- `## Task` 見出し（`## Agent` に統一）
- Good: 4 skill 統一で LLM 可読性・姉妹整合確保
- Good: 固有ブロック許容で skill の特色を殺さない
- Good: MODULARIZATION の Thin Wrapper と整合
- Bad: 既存 4 ファイルの整理作業が発生（別タスクで実施）
- Bad: 将来 generator が増えた時、このテンプレと合わないケースが出る可能性

### Option 2: 現状維持

各 skill の特色・履歴を尊重。新規 generator は既存を見て模倣。

- Good: 追加コスト無し
- Bad: 揺れが再発する (既に `commit` で実測: `## Task` 揺れ, 重複セクション)
- Bad: LLM が構造解釈に迷う箇所が残る

### Option 3: generator 系を 1 つの共有 skill に統合

`skills/lib/generator-workflow.md` を作り、4 skill が `@import` する。

- Good: DRY 完全達成
- Bad: YAGNI 違反（skill 独立進化の自由度を奪う）
- Bad: 固有ブロック（Sandbox-Compatible Commit, Visual Recording 等）を共有化すると scope がブレる
- Bad: MODULARIZATION の Thin Wrapper 原則を超えた抽象化

## Decision Outcome

Chosen option: **Option 1**。理由は 4 skill の揺れを実測して
「単純な統一基準で解消できる」ことが確認でき、かつ固有ブロック許容で
skill の独立性を保てるため。Option 3 は YAGNI 違反で skill 独立進化を
阻害するため却下。Option 2 は揺れが再発する empirical 証拠
（`commit` の `## Task` 揺れ）があるため却下。

### Positive Consequences

- generator 系 4 skill が同一骨格で読めるようになり LLM 解釈の曖昧性が減る
- 新規 generator 追加時に「この ADR を参照」で準拠基準が明確
- 固有ブロック位置が規定されることで固有の意図（例: sandbox 対応）が読み取りやすい

### Negative Consequences

- 既存 4 ファイルの整理作業が発生（commit は部分完了、checkout/pr/issue は未着手）
- 将来の generator（例: memo generator, test-scenario generator）がこのテンプレに収まらない場合、本 ADR を supersede する新 ADR が必要

## Out of Scope

- 既存 4 skill の整理実装は別タスク（Issue 起票）
- generator 系 agent (`agents/generators/*.md`) の構造統一は別 ADR
- 非 generator 系 skill (review 系、workflow 系等) への適用は別判断

## Current Process vs New Process

| Aspect                             | Before                             | After                                         |
| ---------------------------------- | ---------------------------------- | --------------------------------------------- |
| Agent テーブル見出し               | `## Task` / `## Agent` 揺れ        | `## Agent` 統一                               |
| Flow セクション                    | skill ごとに有無・内容揺れ         | 削除（Execution で十分）                      |
| Execution と重複する独立セクション | 許容（例: `## Message Selection`） | 禁止（Execution に統合）                      |
| 固有実行ブロック                   | 配置揺れ可能性                     | H3 で `## Execution` 直下、命名は概念名で自由 |
| 新規 generator 追加時              | 既存模倣（揺れ再発リスク）         | 本 ADR 準拠                                   |

## Implementation Guidelines

新規または既存 generator skill を編集する際:

1. frontmatter → H1 → 概要 → Input → Agent → Execution → Display Format → Verification の順でセクションを配置
2. `## Agent` テーブルは 1 行（Type=Agent, Name=`<name>-generator`, Purpose=短い説明）
3. `## Execution` テーブルは Step 番号付きの Action 列のみ
4. 固有の実行コード（heredoc, gh command 等）は H3 見出しで `## Execution`
   の直下に置く。H3 タイトルは概念を端的に表す名前にする
  （既存例: `### Sandbox-Compatible Commit`, `### Visual Recording`）
5. Flow 図は書かない。「`[A] → [B] → [C]`」のような 1 行表現は Execution テーブルで代替できる
6. Size: ≤100 lines を維持（MODULARIZATION.md 準拠）

## Rollback Plan

Trigger Conditions:

- 統一テンプレートに収まらない generator skill が 3 件以上発生
- H3 配置ルールが守られず、Execution 直下の構造が予測不能になった

Rollback Steps:

1. 本 ADR を deprecated に更新
2. 新 ADR で「generator 系の構造基準を撤廃し、skill 個別判断に戻す」と記録
3. 既存 skill の構造は現状維持（変更しない）

## Reassessment Triggers

- 新規 generator skill 追加時にこのテンプレでは不足な構造要件が判明した時
- `user-invocable: true` の非 generator skill (例: `/verify`) が同パターンに従うと分かり、テンプレ適用範囲拡張を検討する時
- MODULARIZATION.md の Thin Wrapper 規約が改訂された時

## Related ADRs

- [ADR 0004: スキル中心アーキテクチャへの再構成](0004-skill-centric-architecture-restructuring.md)
  - skill/command 分離の根幹。本 ADR は skill 内部の構造統一を扱う
- [ADR 0042: Colocate Skill-Specific Scripts Within Skill Directory](0042-colocate-skill-specific-scripts-within-skill.md)
  - skill 内ファイル配置の一貫性
- [ADR 0046: Colocate audit templates under skills/audit/references](0046-colocate-audit-templates-in-skill-references.md)
  - 同じく「skill 単位の自己完結」原則

---

_Created: 2026-04-21_
_Author: thkt_
_ADR Number: 0048_
