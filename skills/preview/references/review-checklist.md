# Review Checklist

## Plan Alignment

Run before per-file review.

### Step 1: Locate the plan

The plan lives in the originating issue's `## Plan` section. Fetch it via the issue reference in the branch or commit messages (`gh issue view <N>`). If no issue is found, search `${CLAUDE_SKILL_DIR}/../../workspace/planning/` for a `*.plan.md` whose name matches the branch or PR title.

If no plan is found, fall back to PR description + commit messages as intent source and skip the U/T rows below.

### Step 2: Checks

Quote the intent line behind every flag. A `wrong` or `missing` flag with no quoted U-NNN / T-NNN line is impression-based; drop it. This screening covers the same three conformance categories as reviewer-conformance; for a deep standalone pass on any branch, run that agent instead.

| Check         | Source                                     | Condition  | Flag as      |
| ------------- | ------------------------------------------ | ---------- | ------------ |
| Unit coverage | U-NNN units in the Plan section            | plan found | missing      |
| Test coverage | T-NNN acceptance tests in the Plan section | plan found | missing      |
| Scope creep   | diff vs all intent sources                 | always     | out-of-scope |
| Impl-wrong    | diff behavior vs a unit goal or T-NNN      | always     | wrong        |

### Output format

```
Plan Alignment: [CLEAN | MISSING <N> | OUT-OF-SCOPE <N> | WRONG <N> | MIXED]
Intent source: <issue #N Plan section | *.plan.md path | PR description | commit messages>
Missing (U): U-NNN - <description> (plan: "<quoted line>")
Missing (T): T-NNN - <description> (plan: "<quoted line>")
Out-of-scope: <file or area> - not traceable to stated intent
Wrong: <U-NNN/T-NNN> - implemented but <gap> (plan: "<quoted line>")
```

Skip silently if no intent source is available at all.

## Per-File Review

| Check        | What to Look For                                    |
| ------------ | --------------------------------------------------- |
| PR alignment | Changes serve the stated purpose                    |
| Code style   | Consistent with surrounding codebase                |
| Security     | Injection, XSS, auth bypass, secret exposure        |
| Side effects | Unintended behavior changes to existing features    |
| Performance  | Unnecessary API/DB calls, memory leaks, N+1 queries |
| Code smells  | Duplication, deep nesting, god functions            |

## Dependency Impact

| Check               | Method                                       |
| ------------------- | -------------------------------------------- |
| Import dependents   | ugrep for imports of changed files/exports   |
| Interface contracts | Verify unchanged function signatures         |
| Shared state        | Check global/module state mutations          |
| Test coverage       | Existing tests still valid for changed paths |

## Test Assessment

### Before suggesting "add tests"

1. Check if the project has test infrastructure
2. Check if similar code has tests
3. Only suggest tests when the project convention expects them
