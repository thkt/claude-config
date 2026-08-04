---
status: "proposed"
---

# ADR-0007: Claude Code 設定の最適化

> Note (2026-04-24): `generating-tdd-tests` → `tdd-cycle` (2026-04-23) → `use-workflow-tdd-cycle` (2026-04-24) に順次改名。本 ADR は履歴保持のため原名を維持。

## Context and Problem Statement

2026-01-27 に実施した徹底監査により、現在の Claude Code 設定の依存関係と使用状況が明確になった。

### 現状の問題

1. **CLAUDE.md の参照過多**: 7つの外部参照があり、一部は重複または自明
2. **エージェントの観点重複**: structure-reviewer と readability-reviewer は観点が近い
3. **当初の削減案は過激すぎた**: 「27→10スキル」の提案は依存関係を無視していた

### 監査で判明した事実

| カテゴリ       | 現状 | 削除可能 | 統合可能                                |
| -------------- | ---- | -------- | --------------------------------------- |
| スキル         | 25個 | 0個      | 1組（vercel + optimizing は統合しない） |
| エージェント   | 16個 | 0個      | 1組（structure + readability）          |
| CLAUDE.md 参照 | 7個  | 3個      | -                                       |

### 依存関係マップ（重要な発見）

```text
PRE_TASK_CHECK_SPEC.md ← settings.json (UserPromptSubmit hook)
AI_OPERATION_PRINCIPLES.md ← /research コマンド（マーカー定義）
WORKFLOW_GUIDE.md ← README.md（ユーザードキュメント）
```

これらは削除不可。

## Decision Outcome

### Phase 1: CLAUDE.md 参照整理

| 参照                    | アクション | 理由                               |
| ----------------------- | ---------- | ---------------------------------- |
| AI_OPERATION_PRINCIPLES | 維持       | /research が参照                   |
| PRE_TASK_CHECK_SPEC     | 維持       | hook が参照                        |
| PRINCIPLES.md           | **削除**   | Development Checks と重複          |
| PERFORMANCE.md          | **削除**   | スキル経由で参照可能               |
| FAILURE_PATTERNS.md     | **削除**   | 16行のシンプルな内容、自動検知可能 |
| WORKFLOW_GUIDE.md       | 維持       | README から参照                    |
| DOCUMENTATION.md        | 維持       | 規約として必要                     |

**結果**: 7 → 4 参照

### Phase 2: エージェント統合

| 現状                    | 変更後                | 理由                             |
| ----------------------- | --------------------- | -------------------------------- |
| structure-reviewer      | reviewer-readability | ファイルレベルと関数レベルを統合 |
| readability-reviewer    | （統合）              | 観点が近い                       |
| reviewer-design | 維持                  | React 専用として価値あり         |

**結果**: 13 → 12 エージェント

### Phase 3: 実行しないこと

| 項目                                                      | 理由                   |
| --------------------------------------------------------- | ---------------------- |
| スキル削除                                                | 全て使用されている     |
| consulting-gemini 削除                                    | 外部連携として価値あり |
| accessing-google-workspace 削除                           | 外部連携として価値あり |
| type-safety + testability + silent-failure 統合           | 観点が異なる           |
| vercel-react-best-practices + optimizing-performance 統合 | 目的が異なる           |

## Consequences

### 変更が必要なファイル

**Phase 1:**

- `CLAUDE.md`: 参照 3 つ削除

**Phase 2:**

- `agents/reviewers/reviewer-readability.md`: 新規作成
- `agents/orchestrators/audit-orchestrator.md`: エージェント参照更新
- `agents/reviewers/structure-reviewer.md`: 削除
- `agents/reviewers/readability-reviewer.md`: 削除
- `.claude-plugin/marketplace.json`: エージェント参照更新
- `.ja/` 配下の対応ファイル: 同期

### リスク

| リスク                       | 軽減策                                           |
| ---------------------------- | ------------------------------------------------ |
| 統合でレビュー観点が失われる | reviewer-readability にすべてのフェーズを含める |
| marketplace.json の更新漏れ  | 変更前にバックアップ                             |

## Considered Options

- 案A: 現状維持
- 案B: 大規模削減（当初案）
- 案C: 本 ADR の計画（採用）

### 案A: 現状維持

- リスク: なし
- デメリット: 参照過多、重複が残る

### 案B: 大規模削減（当初案）

- リスク: 依存関係の破壊
- デメリット: 調査で却下済み

### 案C: 本 ADR の計画（採用）

- リスク: 低〜中
- メリット: 依存関係を維持しつつ最適化

## 参考情報

### 監査で確認した依存関係

```text
スキル → エージェント依存:
- applying-code-principles: 9 エージェントが依存
- generating-tdd-tests: generator-test, reviewer-testability, /code, /fix
- reviewing-readability: readability-reviewer, reviewer-document, reviewer-spec

コマンド → エージェント依存:
- /audit → audit-orchestrator → 14 reviewers + devils-advocate + audit-integrator
- /code → generator-test
- /fix → resolver-build, generator-test
```

### PRE_TASK_CHECK の分離意図

| ファイル                | 役割                   |
| ----------------------- | ---------------------- |
| PRE_TASK_CHECK_SPEC.md  | 表示フォーマット（UI） |
| PRE_TASK_CHECK_RULES.md | 判断ロジック           |

**意図**: 関心の分離。統合しない。

## 教訓

| ルール             | 説明                                                |
| ------------------ | --------------------------------------------------- |
| 依存関係を先に確認 | hook、コマンド、README からの参照を確認してから判断 |
| 削除可能 ≠ 不要    | 依存がなくても価値があれば維持                      |
| 意図的な分離を尊重 | 統合前に分離の理由を確認                            |

## 結論

Phase 1 のみ実行。Phase 2, 3 は効果が限定的なため見送り。
