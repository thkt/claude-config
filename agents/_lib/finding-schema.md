# Canonical Finding Schema

Base fields required from all audit sub-reviewers. Leader (Medium tier) or Integrator (Large tier) normalizes domain-specific extensions during integration.

## Base Fields (required)

Per finding, output a Markdown heading followed by a single table.

### {PREFIX}-{seq}

| Field        | Value                                                | Source      |
| ------------ | ---------------------------------------------------- | ----------- |
| Agent        | reviewer-name                                        | auto-filled |
| Severity     | critical / high / medium / low                       | reviewer    |
| Category     | domain-specific category                             | reviewer    |
| Location     | `file:line`                                          | reviewer    |
| Evidence     | code snippet or observation                          | reviewer    |
| Trigger      | concrete condition that causes the issue to manifest | reviewer    |
| Reasoning    | why this is an issue                                 | reviewer    |
| Fix          | suggested fix                                        | reviewer    |
| Verification | check type. question                                 | reviewer    |

### Agent (auto-fill)

The integrator/leader populates `Agent` from the spawning reviewer's `name:` frontmatter. Reviewers MUST NOT repeat their own name in the output; omit the Agent row entirely.

### Trigger vs Reasoning

These are distinct fields. Do not merge them.

| Field     | Question           | Example                                                                          |
| --------- | ------------------ | -------------------------------------------------------------------------------- |
| Trigger   | When does it fire? | "Every Bash tool call (PreToolUse hook runs on every invocation)"                |
| Reasoning | Why is it bad?     | "awk fork+exec on hot path costs 2-5ms before the case filter can short-circuit" |

If Trigger is identical to Reasoning's opening clause, the finding is too abstract. Restate Trigger as an observable condition that a verifier could reproduce.

### Reporting Bar

Report a finding only when all of the following hold. Otherwise, do not report.

- The reviewer can state the issue without hedging language (no "might", "could", "possibly")
- A concrete trigger and reasoning can both be written (see Language Constraints)
- The reviewer read the target file and confirmed the condition in current code

reviewer-security has a lower bar. Include a finding even when exploitability is uncertain, provided a concrete fix suggestion accompanies it.

### Pre-Report Verification

Before reporting any finding, the reviewer MUST do the following.

1. Read the target file at the reported location (± 20 lines context)
2. Confirm the issue exists in the actual code, not from memory or assumption
3. A finding without a prior file read is invalid. The leader discards it

### Language Constraints

Evidence, Trigger, and Reasoning fields MUST use concrete language.

| Prohibited             | Replace with                       |
| ---------------------- | ---------------------------------- |
| might, could, possibly | does, causes, results in           |
| potentially            | when [condition], [consequence]    |
| may cause              | causes [X] when [Y]                |
| theoretically          | (remove. describe the actual path) |
| in some cases          | when [specific condition]          |

## Calibration Filters

Apply in order. If any filter excludes, do not report.

| Filter              | Question                                                        | Exclude when                                       |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| Senior Engineer     | Would a senior engineer request a change?                       | "Depends on preference" or "wouldn't block the PR" |
| Harm                | Concrete trigger for bug/data loss/security/maintenance burden? | Cannot name one                                    |
| Fix Proportionality | Fix proportional to risk?                                       | Significant refactoring for low-severity issue     |

### Context Test

| Context         | Action                                                            |
| --------------- | ----------------------------------------------------------------- |
| Cold path       | Exclude unless severity >= high                                   |
| Intentional     | Code comments, error messages, or naming suggest intent → exclude |
| Framework idiom | Follows framework/library convention → exclude                    |
| Indirect cover  | Tested through caller or integration test → exclude (TC)          |
| Semantic differ | Structurally similar but different business logic → exclude (DRY) |

Each reviewer's Calibration section has domain-specific REPORT/SKIP examples. When uncertain, prefer SKIP. The challenger exists to catch false negatives, but false positives waste pipeline capacity.

## Overview Table

When multiple findings exist, prepend this summary table.

| ID  | Severity | Category | Location |
| --- | -------- | -------- | -------- |

## Domain-Specific Extensions (normalized during integration)

Reviewers not listed use base fields only.

| Reviewer               | Extra Fields                                      | Req/Opt | Normalization                                                  |
| ---------------------- | ------------------------------------------------- | ------- | -------------------------------------------------------------- |
| reviewer-causation     | five_whys, root_cause                             | req     | root_cause → reasoning; five_whys → append to evidence         |
| reviewer-progressive   | recommendations                                   | req     | Append as separate items                                       |
| reviewer-readability   | subcategory                                       | opt     | Append to category as category/subcategory                     |
| reviewer-performance   | impact                                            | opt     | Append to evidence; impact → reasoning note                    |
| reviewer-accessibility | wcag (req), apg_pattern (req), code_example (opt) | req/opt | wcag → evidence; apg_pattern, code_example → fix context       |
| reviewer-coverage      | related_code, criticality                         | opt     | related_code → evidence; criticality → reasoning note          |
| reviewer-encapsulation | type_name, scores                                 | opt     | Append to evidence; scores → reasoning note                    |
| reviewer-security      | entry_points (in hint)                            | opt     | Already in verification_hint                                   |
| reviewer-resilience    | blast_radius, failure, hypothesis                 | req     | blast_radius replaces severity; failure+hypothesis → reasoning |
| reviewer-duplication   | multi_location_evidence                           | req     | Evidence lists all source locations                            |
| reviewer-reuse         | existing_code                                     | req     | Evidence pairs new code with existing alternative              |
| reviewer-efficiency    | path_frequency                                    | opt     | hot/warm/cold → reasoning note                                 |
| reviewer-strictness    | type_coverage, strict_flags                       | opt     | Summary-level metrics only                                     |

## ID Prefix Registry

| Prefix | Reviewer                                  |
| ------ | ----------------------------------------- |
| SEC    | reviewer-security                         |
| SF     | reviewer-silence                          |
| TS     | reviewer-strictness                       |
| TD     | reviewer-encapsulation                    |
| CQ     | reviewer-readability                      |
| PE     | reviewer-progressive                      |
| RC     | reviewer-causation / integrator synthesis |
| DP     | reviewer-design (module depth)            |
| RP     | reviewer-react-pattern                    |
| TEST   | reviewer-testability                      |
| TC     | reviewer-coverage                         |
| PERF   | reviewer-performance                      |
| A11Y   | reviewer-accessibility                    |
| DRY    | reviewer-duplication                      |
| REUSE  | reviewer-reuse                            |
| EFF    | reviewer-efficiency                       |
| DOC    | reviewer-document                         |
| OPS    | reviewer-operations                       |
| PQ     | reviewer-prompt                           |
| CHX    | reviewer-resilience                       |
| PF     | pre-flight (not an agent file)            |

## Consolidation Rule

When the same pattern appears in multiple locations, apply these rules.

- Report as a SINGLE finding
- List all locations in evidence (max 5, then "and N more")
- Set severity to the highest among occurrences

For example, "Unused import in 7 files" is one finding with severity from the worst case.

## Default Error Handling

All reviewers apply the following unless overridden in their own definition.

| Error             | Action                                   |
| ----------------- | ---------------------------------------- |
| bfs returns empty | Report 0 files found, do not infer clean |
| Tool error        | Log error, skip file, note in summary    |

Domain-specific guards (missing input, unavailable dependency) remain in each reviewer's own `## Error Handling` section.
