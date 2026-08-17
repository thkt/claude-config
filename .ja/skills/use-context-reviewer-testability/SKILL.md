---
name: use-context-reviewer-testability
description: テスト可能なコード設計のレビュー。セキュリティ (use-context-reviewer-security)、可読性 (use-context-reviewer-readability) には使わない。
when_to_use: テスト容易性, モック, mock-friendly, DI
allowed-tools: Read Task Bash(ugrep:*) Bash(bfs:*)
agent: reviewer-testability
context: fork
user-invocable: false
---

# テスト容易性レビュー

## 検出

| ID  | パターン                       | 修正                            |
| --- | ------------------------------ | ------------------------------- |
| TE1 | `import { db }` の直接使用     | 依存をパラメータとして注入      |
| TE1 | クラス内の `new Service()`     | コンストラクタ注入              |
| TE2 | コンポーネント内の `fetch()`   | hook/service に抽出して注入     |
| TE2 | 副作用とロジックの混在         | pure/impure を分離              |
| TE3 | 深い mock チェーン             | 依存を簡潔にする                |
| TE4 | グローバルな `config` アクセス | config を prop/parameter で渡す |
| TE4 | ロジック内の `Date.now()`      | clock/time provider を注入      |
| TE5 | 密結合                         | 抽象に依存する (DIP)            |

## 基準

テストセットアップ 10 行未満。深い mock チェーンなし。依存は明示的。

## 参照

| トピック | ファイル                                               |
| -------- | ------------------------------------------------------ |
| DI       | ${CLAUDE_SKILL_DIR}/references/dependency-injection.md |
| Pure     | ${CLAUDE_SKILL_DIR}/references/pure-functions.md       |
| Mocking  | ${CLAUDE_SKILL_DIR}/references/mock-friendly.md        |
