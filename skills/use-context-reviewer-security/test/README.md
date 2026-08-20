# Test harness for use-context-reviewer-security

A harness for judging reviewer-security's detection accuracy from the outside. Accuracy is measured by Recall and FP Rate rather than by the LLM's own confidence.

## Goal

| Metric             | Calculation                                        | What it says                 |
| ------------------ | -------------------------------------------------- | ---------------------------- |
| Recall             | vuln-cases detected / all vuln-cases               | The inverse of the miss rate |
| FP Rate            | safe-cases that drew a finding / all safe-cases    | The over-detection rate      |
| Recall by category | Recall per category (A01-A10)                      | Where the weakness sits      |
| Diff from previous | The difference against the last log under results/ | Regression detection         |

## Layout

```text
test/
├── README.md            # this document
├── expected.json        # expectations (what to detect / what not to)
├── cases/
│   ├── vuln/            # must be detected (positive)
│   ├── safe/            # must not be detected (negative)
│   └── cross-file/      # detectable only across several files together
└── results/             # run logs (gitignored)
```

## How to run it

The protocol, the verdict set, and the expected.json schema live in `skills/_lib/review-harness.md`. What follows is what belongs to this harness alone.

The blind protocol's leak was found here on 2026-06-04: the earlier baselines (2026-05-02 easy, 2026-05-02 hard, 2026-05-07 llm01) stated the vuln/safe directory roles in the prompt, and the hard run additionally described each file's vulnerability. Their Recall numbers are contaminated, and the model differs too (opus-4-7 vs opus-4-8), so those deltas mix protocol and model.

A `cases/cross-file/` pair is detectable only across several files together, so the dispatch prompt states how the pair relates. That is the one piece of structure this harness gives the agent.

`min_findings` is stated where one file holds several independent vulnerabilities (cross-file/middleware.ts holds both the matcher gap and the unsigned cookie role). `notes` (plural) lists what is expected of each.

## Source

The layout of cases and the difficulty categories draw on `tests/security-skills/` in [sabakan0123/claude-security-scan](https://github.com/sabakan0123/claude-security-scan) (MIT). The code itself is written here against reviewer-security's own detection patterns (OWASP A01-A10).
