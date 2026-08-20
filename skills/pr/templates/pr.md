# PR Template

When /pr cannot find a repository PR template, it generates the body from this skeleton.

## Template

Replace `{...}` with content at generation time. Omit an `(optional)` section, heading and all, when there is nothing to write. Include `Preview URL:` only for PRs with UI changes; `use-workflow-pageshot` reads it.

```markdown
Preview URL: http://localhost:3000

## What & Why

{What this PR does - 1-2 sentences}
{Why - what problem it solves or what it enables}

## Review focus

- {Where to look hard, and what can be skimmed}
- {Migration, rollback, or performance risk. Omit this line when there is none}

## Changes (optional)

- {Change 1. What changed and why, in one line. Not an inventory of files or functions}
- {Change 2. Same}

## Scope (optional)

- Not included: {What this PR intentionally does NOT do}

## Design Decisions (optional)

- {Why this approach was chosen over alternatives}

## How to Test

1. {Step}
2. {Expected result}

## Related

- Closes #{issue}
```

## Guidelines

| Field            | OK                                                          | NG                                               |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| What & Why       | Add CSV export to unblock offline analysis                  | Add CSV export feature (no Why)                  |
| Review focus     | Look hard at the concurrency cap math; skim the README diff | Omitted (reviewer reads everything equally)      |
| Changes          | Add ExportButton, chosen over menu for 1-click              | Listing the files touched (the diff shows it)    |
| Scope            | Auth token refresh is not included (separate PR)            | Omitted on large PRs (reviewer guesses boundary) |
| Design Decisions | Used streaming to avoid OOM on large datasets               | Omitted (forces reviewer to guess why)           |
| How to Test      | Click Export → verify .csv downloads with 3 rows            | Test the feature (vague)                         |
| Preview URL      | Preview URL: http://localhost:3000/dashboard                | Missing despite UI changes                       |
