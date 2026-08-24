# Reviewer accuracy harness

The shared protocol behind every `use-context-reviewer-*` harness under `<skill>/test/`. Accuracy is judged from the outside by Recall and FP Rate rather than by the reviewer's own confidence.

## Blind protocol

Labels, expectations, or hints in the dispatch prompt contaminate Recall (found 2026-06-04 on the security harness, which invalidated its earlier baseline).

1. Copy the cases into a temp directory under neutral names (case-01.ts and up, alternating the flag and clean cases). Keep framework-convention names such as `./db`, which are context
2. Launch the reviewer agent with the Agent tool. The prompt carries the target path and the output format, and nothing else. The words flag, clean, vuln, safe, test, and expected are banned, as is any description of what a file holds
3. Fix the comparison criteria before dispatch. Do not move them afterwards
4. Pick each case's verdict from the table below and record the run as an array of `{file, verdict}` in `<skill>/test/results/YYYY-MM-DD-*.json`
5. Run `python3 skills/_lib/review_score.py <skill>/test/expected.json <results> [previous-results]`. Do not count the metrics by hand
6. Run `python3 skills/_lib/harness_hash.py <skill>` and write the printed `definition_sha256` and `corpus_sha256` as top-level keys of the record

The sequential naming and the paired structure still let an agent guess it is looking at a test set. Going fully blind would mean embedding the cases in realistic scaffolding; removing label leakage comes first.

## Record freshness

A record names, by hash, which reviewer and which corpus the run measured. The gate reads the last record by name, so a second run on one date takes a name that sorts after the run it supersedes. A record written before the definition or the corpus moved did not measure the reviewer the repository ships now. Hashes rather than dates, because CI checks out shallow and cannot read `git log` dates. `skills/_lib/tests/harness_hash_test.py` matches the newest record's hashes against the current content and fails a skill with no record as unmeasured.

| Key                 | Covers                                          |
| ------------------- | ----------------------------------------------- |
| `definition_sha256` | `agents/reviewers/reviewer-<name>.md`           |
| `skill_sha256`      | `<skill>/SKILL.md`                              |
| `corpus_sha256`     | `<skill>/test/cases/**` and `expected.json`     |

## Verdict set

These six, and nothing else. Earlier logs each invented their own wording (`true`, `full_hit`, `detected_below_severity_min`), which left the runs incomparable.

| verdict          | Meaning                                                  |
| ---------------- | -------------------------------------------------------- |
| `hit`            | The expected finding, reported at severity_min or above  |
| `below_severity` | The expected finding, reported below severity_min        |
| `other_finding`  | A finding on the file, but not the expected one          |
| `miss`           | No finding on the file                                   |
| `pass`           | A clean case that drew no finding                        |
| `false_positive` | A clean case that drew a finding                         |

## expected.json schema

```json
[
  { "file": "cases/flag/<name>.ts", "expected": "detected", "category": "<skill's own id>", "severity_min": "medium", "note": "<what must be caught>" },
  { "file": "cases/clean/<name>.ts", "expected": "no_finding", "note": "<why it is clean>" }
]
```

A `detected` entry names its category so per-category recall can split the misses. `min_findings` defaults to 1; state it only when one file holds several independent findings.
