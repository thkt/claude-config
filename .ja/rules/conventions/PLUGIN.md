---
paths:
  - ".claude/.claude-plugin/**"
  - ".claude-plugin/**"
---

# Plugin Conventions

`.claude-plugin/` 配下の Claude Code プラグイン定義に対するルール。プラグインは install 時にリポジトリ全体を clone し、`skills/`、`agents/`、`workflows/` を無条件に auto-discovery する。`plugins` の `commands`/`agents`/`skills` は広告範囲の指定で、discovery を絞らない。分割すると各プラグインが同一の skill/agent を別 namespace で再登録する。

| 対象      | 規則                                               |
| --------- | -------------------------------------------------- |
| `plugins` | `marketplace.json` で build 1 件に保つ             |
| `source`  | `{ "source": "github", "repo": "thkt/dotclaude" }` |
