---
status: "accepted"
---

# ADR 0004: スキル中心アーキテクチャへの再構成

## Context and Problem Statement

Claude Codeプラグインの構造が以下の課題を抱えていた：

1. **散在するリファレンス**: `references/commands/` に詳細ドキュメントが分散
2. **肥大化したコマンドファイル**: 一部のコマンドがMiller's Law（7±2）を超過
3. **曖昧なディレクトリ構造**: `docs/adr/` と `docs/COMMANDS.md` の役割が不明確
4. **パターンの孤立**: `patterns/` ディレクトリが関連スキルから分離

ADR 0001/0002で定義したモジュール化パターンを全体に適用する必要があった。

## Considered Options

- 現状維持: references/ と skills/ の二重構造を継続
- 段階的移行: skills 中心化を 1 項目ずつ進める
- 一括再構築 (採用): references 廃止 + skills/ 統合 + 6 項目変更を同時実施

## Decision Outcome

### 1. references/ の廃止とskills/への統合

```text
Before:
references/
├── commands/
│   ├── code/
│   ├── fix/
│   └── shared/
└── FRONTMATTER_SPEC.md

After:
skills/
├── orchestrating-workflows/
│   └── references/
│       ├── code-workflow.md
│       ├── fix-workflow.md
│       └── shared/
├── managing-planning/
│   └── references/
└── managing-testing/
    └── references/
```

**理由**: スキルは「知識ベース」として機能し、関連するリファレンスを包含すべき。

### 2. 新しいスキルカテゴリの導入

| 新スキル                  | 目的                              | 統合したリファレンス      |
| ------------------------- | --------------------------------- | ------------------------- |
| `orchestrating-workflows` | /code, /fix等のワークフロー管理   | code/, fix/, shared/      |
| `managing-planning`       | /think, /sow, /specのプランニング | SOW生成、Spec生成         |
| `managing-testing`        | /auto-test, E2Eテスト             | auto-test, e2e            |
| `managing-documentation`  | /adr, /rulifyドキュメント生成     | ADR, rulify workflow      |
| `managing-git-workflows`  | Git操作（/commit, /pr等）         | branch, commit, pr, issue |

### 3. docs/adr/ → adr/ への移動

```text
Before: docs/adr/0001-*.md
After:  adr/0001-*.md
```

**理由**: ADRはドキュメントではなくアーキテクチャ決定の記録。トップレベルに配置することで重要性を明示。

### 4. コマンドの薄いラッパー化

ADR 0001/0002パターンに従い、全コマンドを以下の構造に統一：

```markdown
# /command

## 目的

[1-2文]

## ワークフロー参照

- [@../skills/xxx/references/yyy.md]

## クイックリファレンス

[必要最小限の情報]
```

**削減効果**: 多くのコマンドが200-300行 → 80-150行に圧縮

### 5. patterns/ のスキルへの統合

```text
Before:
patterns/
├── frontend/
│   └── container-presentational.md
└── code/
    └── naming.md

After:
skills/
├── applying-frontend-patterns/
│   └── references/
│       └── container-presentational.md
└── reviewing-readability/
    └── references/
        └── naming.md
```

### 6. ADR Rulify実施

ADR 0001/0002/0003から強制ルールを抽出：

| 生成ルール                | 抽出元         | 配置先               |
| ------------------------- | -------------- | -------------------- |
| `MODULARIZATION_RULES.md` | ADR 0001, 0002 | `rules/workflows/`   |
| `PLUGIN_ARCHITECTURE.md`  | ADR 0003       | `rules/conventions/` |

## Consequences

### ポジティブ

- **認知負荷の軽減**: コマンドファイルが薄いラッパーとなり、概要把握が容易に
- **知識の集約**: 関連する情報がスキル単位でまとまり、発見性が向上
- **一貫性**: 全コマンドが同じパターンに従い、予測可能性が向上
- **保守性**: 共通ロジックがskills/に集約され、重複が削減
- **ルール強制**: ADRから抽出したルールにより、パターン違反を防止

### ネガティブ

- **学習コスト**: 新しい構造を理解するまで時間が必要
- **移行作業**: 大規模なファイル移動・再構成が必要
- **参照更新**: 既存の参照パスを更新する必要あり

### リスクと軽減策

| リスク         | 軽減策                    |
| -------------- | ------------------------- |
| 破壊された参照 | grep で全参照を検索・修正 |
| EN/JP不整合    | 同時に両バージョンを更新  |
| 機能の欠落     | コマンドごとに動作確認    |

## 変更統計

| 変更       | Before | After | 差分            |
| ---------- | ------ | ----- | --------------- |
| ファイル数 | -      | -     | 151ファイル変更 |
| 削除行数   | -      | -     | -9,158行        |
| 追加行数   | -      | -     | +6,693行        |
| 純減       | -      | -     | -2,465行        |

## 準拠

このADRは以下のパターンに従う：

- [ADR 0001](./0001-code-command-responsibility-separation.md) - Miller's Law、薄いラッパー
- [ADR 0002](./0002-fix-modularization-and-tdd-commonization.md) - 3層アーキテクチャ
- [ADR 0003](./0003-marketplace.md) - モノリシック構造維持

## 関連ルール

- [MODULARIZATION_RULES.md](../rules/workflows/MODULARIZATION_RULES.md)
- [PLUGIN_ARCHITECTURE.md](../rules/conventions/PLUGIN_ARCHITECTURE.md)
