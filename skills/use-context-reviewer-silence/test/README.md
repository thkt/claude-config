# Test harness for use-context-reviewer-silence

The corpus that measures reviewer-silence's detection accuracy. The protocol, the verdict set, and the expected.json schema live in `skills/_lib/review-harness.md`.

`cases/flag/` must draw a finding and `cases/clean/` must not. `expected.json` names the category each flag case belongs to.
