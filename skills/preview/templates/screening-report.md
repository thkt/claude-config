# Screening Report Template

The skeleton `/preview` emits in the final execution step. It goes to the conversation and is not saved to a file.

## Template

`{...}` is replaced with content at generation.

```markdown
## PR Screening Report

### Overview

{Background and purpose in 2-3 sentences}

### Changes Summary

| File | Change Summary |
| ---- | -------------- |

### Dependency Impact

{Affected files, regression risk}

---

### Requires Action

{`[must]` and `[want]` findings with file:line}

### Awareness

{`[imo]`, `[ask]`, `[nits]`, `[info]` items with file:line}

---

### Proposed Review Comments

{Grouped by file, with labels}
```

## Guidelines

The split between `Requires Action` and `Awareness` is decided by the label. Label definitions and severities live in SKILL.md § Comment Labels.

Each comment under `Proposed Review Comments` follows the format in SKILL.md § Comment Tone. A comment written here may be posted verbatim, so never auto-post.

Before raising `[ask]` or anything at `[want]` or above, trace the problem to a reachable runtime call site. What cannot be traced does not go in.
