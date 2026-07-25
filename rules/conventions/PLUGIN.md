---
paths:
  - ".claude/.claude-plugin/**"
  - ".claude-plugin/**"
---

# Plugin Conventions

Rules for Claude Code plugin definitions under `.claude-plugin/`.

## Constraints

A plugin clones the whole repository at install time and auto-discovers `skills/`, `agents/`, and `workflows/` unconditionally. The `commands` / `agents` / `skills` fields on a plugin only declare what it advertises. Splitting into several plugins makes each one re-register the same skill and agent under a different namespace.

| Rule                | Guideline                                                   |
| ------------------- | ----------------------------------------------------------- |
| Single plugin       | Keep `plugins` in `marketplace.json` to the one build entry |
| Source              | Use `{ "source": "github", "repo": "thkt/dotclaude" }`      |
| Preserve references | Keep skills/, rules/, agents/ cross-references intact       |
