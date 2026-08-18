# Bug Template

When /issue classifies the request as bug, it generates the title and body from this skeleton.

## Template

`{...}` is replaced with content at generation. Sections marked `(optional)` are omitted, heading and all, when there is nothing to say.

```markdown
## What & Why

{What is broken - 1 sentence}
{User impact - why this matters}

## Steps to Reproduce

1. {Step 1}
2. {Step 2}
3. {Step 3}

## Expected vs Actual

- Expected: {Specific value or behavior}
- Actual: {Error message or actual value}

## Scope

- In scope: {What this issue fixes}
- Out of scope: {Related but not addressed here}

## Constraints (optional)

- {Fix constraints: no breaking changes, root cause not workaround, etc.}

## Environment (optional)

- Browser/OS: {e.g., Chrome 120 / macOS 14}
- Version: {e.g., v1.2.3}
```

## Guidelines

| Field              | OK                                            | NG                          |
| ------------------ | --------------------------------------------- | --------------------------- |
| What & Why         | Login fails, blocking 30% of users            | Login is broken             |
| Expected vs Actual | Expected: 200 OK / Actual: 500 error response | Works correctly (vague)     |
| Scope - Out of     | Auth refactor is out of scope                 | (omitted)                   |
| Constraints        | Fix root cause, not workaround                | (omitted when fix is risky) |
