---
paths:
  - ".claude/.claude-plugin/**"
  - ".claude-plugin/**"
---

# Plugin Conventions

`.claude-plugin/` 配下の Claude Code プラグイン定義に対するルール。

## 制約

プラグインは install 時にリポジトリ全体を clone し、`skills/` `agents/` `workflows/` を無条件に auto-discovery する。`plugins` の `commands` / `agents` / `skills` フィールドは広告範囲の指定でしかない。プラグインを分割すると、各プラグインが同一の skill / agent を別 namespace で再登録する。

| ルール         | ガイドライン                                              |
| -------------- | --------------------------------------------------------- |
| 単一プラグイン | `marketplace.json` の `plugins` は build 1 件に保つ       |
| ソース         | `{ "source": "github", "repo": "thkt/dotclaude" }` を使用 |
| 参照を保つ     | skills/, rules/, agents/ のクロス参照を保持               |
