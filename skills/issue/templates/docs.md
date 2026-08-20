# Docs Template

When /issue classifies the request as docs, it generates the title and body from this skeleton.

## Template

`{...}` is replaced with content at generation.

```markdown
## What & Why

{What documentation needs to be added or changed}
{Why - what problem does the reader face without this?}

## Location

{File path or section to modify}

## Changes

- {Specific change 1}
- {Specific change 2}

## Scope

- In scope: {What this issue covers}
- Out of scope: {Related docs not addressed here}
```

## Guidelines

| Field      | OK                                                    | NG                        |
| ---------- | ----------------------------------------------------- | ------------------------- |
| What & Why | Add setup guide. New contributors can't onboard       | Add setup guide (no Why)  |
| Location   | `docs/getting-started.md`, Setup section              | Somewhere in docs (vague) |
| Changes    | Add prerequisites list, install steps, verify command | Write setup documentation |
| Scope      | Only local dev setup, not CI/CD                       | (omitted)                 |
