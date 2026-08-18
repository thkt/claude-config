# DR Gaps Audit Report Template

The skeleton that `/census` Phase 5 emits. Repeat the Source File Decisions `###` section per source file and the Prose Document Decisions `###` section per document. Batch source files with no decisions into one trailing line. Record a document with no decisions as `no decisions found` under its `###`.

## Template

Substitute `{...}` from findings. For enum cells, pick the matching value from the `/`-separated choices. The three DR Promotion Candidates rows show the challenge-verdict to Final mapping. Write the one matching row per candidate.

```markdown
# DR Gaps Audit: {YYYY-MM-DD}-{HHMMSS}

## Summary

| Metric                  | Value         |
| ----------------------- | ------------- |
| Scope                   | {repo / path} |
| Source files scanned    | {N}           |
| Documents scanned       | {N}           |
| Decision candidates     | {N}           |
| DR-covered (excluded)   | {N}           |
| Net new candidates      | {N}           |
| DR promotion candidates | {N}           |

## Source File Decisions

### {file} ({N} lines)

| #   | Line   | Decision  | Evidence   | Documented?        | Incomplete-contract? | Impact    | Reversibility       |
| --- | ------ | --------- | ---------- | ------------------ | -------------------- | --------- | ------------------- |
| 1   | {line} | {summary} | {evidence} | Yes / Partial / No | Yes / No             | H / M / L | high / medium / low |

No net-new decisions in {files}.

## Prose Document Decisions

### {file}

| #   | Line   | Decision Verb | Decision  | Impact    | Reversibility       |
| --- | ------ | ------------- | --------- | --------- | ------------------- |
| 1   | {line} | {verb}        | {summary} | H / M / L | high / medium / low |

## DR Promotion Candidates (post-challenge)

keep {N} / downgrade {N} / drop {N}

| #   | Candidate                   | Initial | Challenge | Final          |
| --- | --------------------------- | ------- | --------- | -------------- |
| 1   | {source}:{line} - {summary} | promote | keep      | DR             |
| 2   | {source}:{line} - {summary} | promote | downgrade | inline-comment |
| 3   | {source}:{line} - {summary} | promote | drop      | skip           |
```
