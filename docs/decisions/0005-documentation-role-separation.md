---
status: "accepted"
---

# ADR-0005: ドキュメントの役割分離とAI最適化

## Context and Problem Statement

Claude設定ディレクトリ（`.claude/`）には複数のドキュメントファイルが存在するが、それぞれの対象読者と最適化方針が明確でなかった。

### 課題

1. CLAUDE.mdが冗長（約100行）で、AIが解析する際のトークン消費が多い
2. README.mdに不正確な情報（存在しないプラグイン、誤ったプラグイン名）
3. EN/JP版の構造が部分的に不一致
4. settings.jsonで制御される設定がドキュメントで重複
5. 重要な制約（完了禁止条件など）が簡略化で失われるリスク

## Considered Options

- 単一 CLAUDE.md 維持 (役割分離なし、簡略化のみ)
- 役割別ファイルへの完全分離 (CLAUDE.md/AGENTS.md/HUMANS.md など)
- 役割分離 + 規約集中化 (採用): CLAUDE.md は AI 向け、ルール集を rules/ に集約

## Decision Outcome

### 1. 対象読者による役割分離

| ファイル  | 対象読者             | 最適化方針                                         |
| --------- | -------------------- | -------------------------------------------------- |
| CLAUDE.md | AI（Claude）         | テーブル形式、最小限のテキスト、リンクで詳細へ委譲 |
| README.md | 人間（GitHub訪問者） | 説明的な構造、具体例、視覚的な整理                 |

### 2. CLAUDE.mdの構造

```markdown
## Rules

| Rule | Reference |
[4行のテーブル]

## Development Checks

| Question | Principle |
[4行のテーブル]

## Completion

[3行の制約]
[2行のリンク]
```

**合計32行**（従来の約1/3）

### 3. 情報の正確性保証

- プラグイン情報は `marketplace.json` と `settings.json` を照合
- 存在しないプラグインへの参照を禁止
- 削除されたファイルへの参照をチェック

### 4. 重複排除ルール

| 設定             | 管理場所                 | ドキュメントでの扱い            |
| ---------------- | ------------------------ | ------------------------------- |
| 言語設定         | settings.json            | 記載不要                        |
| 削除コマンド禁止 | settings.json deny list  | CLAUDE.mdに代替コマンドのみ記載 |
| 完了条件         | CODE_THRESHOLDS.mdに統合 | CLAUDE.mdに要約のみ             |

### 5. 必須保持項目

簡略化しても以下は必ず保持：

- `Never complete with: failing tests, build errors, unresolved errors`
- `Command discovery: README.md → package.json → ask user`
- 削除操作の代替コマンド

## Consequences

### ポジティブ

- CLAUDE.mdのトークン消費が約67%削減
- AIが構造化データとして解析しやすい
- 人間向けドキュメントは説明が充実
- 不正確な情報が排除された

### ネガティブ

- 詳細情報へのアクセスに1クリック必要
- 新規参照ファイル追加時は両方更新が必要

### 学習事項

1. **必要充分の原則**: 簡略化が目的ではなく、必要な情報を適切な形式で提供することが目的
2. **制約の明示**: 暗黙の制約（tests=0の意味など）は明示的に記載
3. **情報源の検証**: ドキュメントの記載は実際のファイル/設定と照合必須

## References

- ADR-0004: skill-centric-architecture-restructuring（スキル中心アーキテクチャ）
- `rules/conventions/DOCUMENTATION.md` - ドキュメント規約
