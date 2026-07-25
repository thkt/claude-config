---
paths:
  - ".claude/.claude-plugin/**"
  - ".claude-plugin/**"
---

# Plugin Conventions

Rules for Claude Code plugin definitions under `.claude/.claude-plugin/`.

## Constraints

Plugins are cached at load time and cannot reference files outside their boundary. External hosting breaks existing cross-references between `skills/`, `rules/`, and `agents/`.

| Rule                | Guideline                                             |
| ------------------- | ----------------------------------------------------- |
| Monolithic source   | Use `source: "./"` in `marketplace.json`              |
| Preserve references | Keep skills/, rules/, agents/ cross-references intact |
| No external plugins | Do not split into externally-hosted plugins           |
