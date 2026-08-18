# Chore Template

When /issue classifies the request as chore, it generates the title and body from this skeleton.

## Template

`{...}` is replaced with content at generation. Sections marked `(optional)` are omitted, heading and all, when there is nothing to say.

```markdown
## What & Why

{What maintenance task needs to be done}
{Why now - risk, tech debt cost, or blocker for other work}

## Changes

- {Specific change 1}
- {Specific change 2}

## Scope

- In scope: {What this issue covers}
- Out of scope: {Related cleanup not addressed here}

## Constraints (optional)

- {No behavior changes, backward compatibility, etc.}
```

## Guidelines

| Field       | OK                                                | NG                              |
| ----------- | ------------------------------------------------- | ------------------------------- |
| What & Why  | Upgrade React 18→19, unblocks concurrent features | Upgrade React (no Why)          |
| Changes     | Update package.json, fix breaking API calls       | Update dependencies (vague)     |
| Scope       | Only React core, not React Router                 | (omitted)                       |
| Constraints | No behavior changes to existing components        | (omitted when scope is unclear) |
