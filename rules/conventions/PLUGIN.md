---
paths:
  - ".claude/.claude-plugin/**"
  - ".claude-plugin/**"
---

# Plugin Conventions

Rules for Claude Code plugin definitions under `.claude-plugin/`. A plugin clones the whole repository at install time and auto-discovers `skills/`, `agents/`, and `workflows/` unconditionally. The `commands` / `agents` / `skills` fields declare what a plugin advertises; they do not narrow discovery. Splitting into several plugins makes each one re-register the same skill and agent under a different namespace.

| Subject   | Rule                                                 |
| --------- | ---------------------------------------------------- |
| `plugins` | Keep it to the one build entry in `marketplace.json` |
| `source`  | `{ "source": "github", "repo": "thkt/dotclaude" }`   |
