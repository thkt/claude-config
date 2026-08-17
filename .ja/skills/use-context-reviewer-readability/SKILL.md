---
name: use-context-reviewer-readability
description: コードの可読性レビュー。セキュリティは use-context-reviewer-security、エラーハンドリングは use-context-reviewer-silence、テスト設計は use-context-reviewer-testability に使う。
when_to_use: 可読性, 明確, 命名, 変数名, 関数名, ネスト, 関数設計, コメント, 複雑, Miller's Law, ミラーの法則, 認知負荷, AI-generated, 過剰設計
allowed-tools: Read Task Bash(ugrep:*) Bash(bfs:*)
agent: reviewer-readability
context: fork
user-invocable: false
---

# 可読性レビュー

しきい値は、作業記憶や 1 画面集中といった認知限界と、McCabe complexity のような確立されたメトリクスに基づく。

| 目標         | 推奨値 | 根拠                                |
| ------------ | ------ | ----------------------------------- |
| 関数行数     | ≤30    | 1 画面の可読性                      |
| ファイル行数 | ≤400   | モジュールレベルの認知上限          |
| ネスト深度   | ≤3     | 作業記憶内での分岐追跡              |
| 関数引数     | ≤3     | 引数順の暗記限界                    |
| 循環的複雑度 | ≤10    | McCabe 1976: パス爆発なくテスト可能 |

## 検出

| ID  | パターン                       | 修正                       |
| --- | ------------------------------ | -------------------------- |
| RD1 | 曖昧な `processData()`         | `validateUserEmail()`      |
| RD1 | 誤解を招く識別子               | 名前は意図を表す           |
| RD2 | ネスト > 3 階層                | guard clause、関数抽出     |
| RD2 | 関数 > 30 行                   | 分解                       |
| RD3 | コメント: `// increment i`     | 自明なので削除             |
| RD3 | コメント: `// TODO: fix later` | issue 化または今修正       |
| RD4 | 単一実装の interface           | 2 つ目の実装が出るまで削除 |
| RD4 | 状態を持たないロジックの class | 純粋関数                   |
| RD5 | 関数引数 > 5                   | 設定オブジェクトまたは分解 |

## 参照ファイル

| トピック        | ファイル                                           |
| --------------- | -------------------------------------------------- |
| Control Flow    | ${CLAUDE_SKILL_DIR}/references/control-flow.md     |
| Comments        | ${CLAUDE_SKILL_DIR}/references/comments-clarity.md |
| AI Antipatterns | ${CLAUDE_SKILL_DIR}/references/ai-antipatterns.md  |
| Naming          | ${CLAUDE_SKILL_DIR}/references/naming.md           |
