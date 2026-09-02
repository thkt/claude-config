# Evidence Report Template

The `report` string enhancer-evidence returns follows this shape. Write `(none)` under Issues when there are none, and `skipped` in a row whose evidence was never collected.

```markdown
## Evidence Integration Report

### Evidence Summary

| Check       | Value                                      |
| ----------- | ------------------------------------------ |
| Build       | pass / fail / skipped                      |
| Tests       | pass / fail (N passed, M failed) / skipped |
| Issues      | 0 / N high, M medium, L low                |
| Adversarial | N/M passed / skipped                       |

### Issues

| #   | Severity | Source | File:Line | Description | Evidence Types | Fix |
| --- | -------- | ------ | --------- | ----------- | -------------- | --- |

### Root Causes

#### RC-001

| Field            | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| description      | one sentence: the real problem                                   |
| category         | architecture / knowledge / tooling / process                     |
| issues_resolved  | [issue references]                                               |
| evidence_types   | [static, outcome, adversarial]                                   |
| five_whys        | [why/answer pairs]                                               |
| action           | unified fix description                                          |
| suggested_action | `/fix` / `/issue` + build workflow (route that resolves this RC) |
| effort           | 5min / 15min / 30min / 1h / manual                               |
```
