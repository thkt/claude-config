# Canonical Finding Schema

The fields every audit reviewer returns per finding. Under a caller that passes a schema (workflows/audit.js `findingsSchema()`), the output is a JSON `findings` array carrying the fields below and nothing else. Under a skill route with no schema, each finding is a heading `### {PREFIX}-{seq}` followed by one table with the same fields. What the reader does next lives in `finding-disposition.md`, and the per-reviewer prefixes and extra fields in `finding-registry.md`.

## Base Fields

The integrator populates the reviewer's name from the spawning agent's `name:` frontmatter. Reviewers do not repeat their own name in the output.

| Field              | Required | Value                                                                                          |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| file               | yes      | The file part of the location                                                                  |
| line               | yes      | The line part of the location, as a string                                                     |
| severity           | yes      | critical / high / medium / low                                                                 |
| summary            | yes      | One sentence naming the issue and its basis                                                    |
| category           | no       | The reviewer's own finding category                                                            |
| trigger            | no       | The concrete condition under which the issue manifests                                         |
| evidence           | no       | The code snippet or observation the finding rests on                                           |
| reasoning          | no       | Why the condition is a problem                                                                 |
| fix                | no       | The change the reviewer suggests                                                               |
| verification       | no       | The check type and the question it answers                                                     |
| disposition        | no       | must / want / imo / nits, per `finding-disposition.md` § Disposition. Omit to take the default |
| disposition_reason | no       | Why the finding departs from the default. Required to override                                 |

### Trigger vs Reasoning

These are distinct fields. Do not merge them. If Trigger is identical to Reasoning's opening clause, the finding is too abstract. Restate Trigger as an observable condition that a verifier could reproduce.

| Field     | Question           | Example                                                                          |
| --------- | ------------------ | -------------------------------------------------------------------------------- |
| Trigger   | When does it fire? | "Every Bash tool call (PreToolUse hook runs on every invocation)"                |
| Reasoning | Why is it bad?     | "awk fork+exec on hot path costs 2-5ms before the case filter can short-circuit" |

### Reporting Bar

Report a finding only when all of the following hold. Otherwise, do not report.

- The reviewer can state the issue without hedging language (no "might", "could", "possibly")
- A concrete trigger and reasoning can both be written (see Language Constraints)
- The reviewer read the target file and confirmed the condition in current code

reviewer-security has a lower bar. Include a finding even when exploitability is uncertain, provided a concrete fix suggestion accompanies it.

### Pre-Report Verification

Before reporting any finding, the reviewer does the following.

1. Read the target file at the reported location (± 20 lines context)
2. Confirm the issue exists in the actual code, not from memory or assumption
3. A finding without a prior file read is invalid. The leader discards it

### Language Constraints

Evidence, Trigger, and Reasoning use concrete language.

| Prohibited             | Replace with                       |
| ---------------------- | ---------------------------------- |
| might, could, possibly | does, causes, results in           |
| potentially            | when [condition], [consequence]    |
| may cause              | causes [X] when [Y]                |
| theoretically          | (remove. describe the actual path) |
| in some cases          | when [specific condition]          |

## Overview Table

Under the skill route, when multiple findings exist, prepend this summary table.

| ID  | Severity | Category | Location |
| --- | -------- | -------- | -------- |

## Duplicate-Location Rule

When the same pattern appears in multiple locations, apply these rules.

- Report as a single finding
- List all locations in evidence (max 5, then "and N more")
- Set severity to the highest among occurrences

For example, "Unused import in 7 files" is one finding with severity from the worst case.

## Default Error Handling

All reviewers apply the following unless their own definition overrides it. Domain-specific guards (missing input, unavailable dependency) sit in each reviewer's own Output section.

| Error             | Action                                   |
| ----------------- | ---------------------------------------- |
| bfs returns empty | Report 0 files found, do not infer clean |
| Tool error        | Log error, skip file, note in summary    |
