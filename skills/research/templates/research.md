# Research Report Template

The template for the report /research generates in Phase 7. The skill reads it at output time, replaces `{...}` with content, fills `${CLAUDE_SESSION_ID}`, and saves to `.claude/workspace/research/YYYY-MM-DD-<slug>.md`.

## Template

Each report follows the structure below. Replace `{...}` at generation time. A section whose heading carries "(... only)" is included only when that condition holds.

```markdown
# Research: {slug}

Generated: {YYYY-MM-DD}
Session: {session-id}
Intent: {Feature planning | Bug investigation | Understanding}
Domain: {Data model | API | Infrastructure | General}
Prior research: {slug of inherited file, or "none found"}

## Purpose

<!-- 1-2 sentences on the goal of this research. Derived from $ARGUMENTS and the Phase 3 intent. -->

{Investigate ... in order to ...}

## Key Findings

<!-- Phase 4 findings, integrated, source-checked, and triaged in Phase 7. All findings, most important first. Sources follow SKILL.md's source notation. Only findings passing triage carry a Next Action, with the linkage (question / OUTCOME / incident) stated in the action cell. All others read record only. -->

| Priority   | Finding   | Source   | Next Action   |
| ---------- | --------- | -------- | ------------- |
| {priority} | {finding} | {source} | {next action} |

## Available Data

<!-- Phase 4 output. Type is free-text (File / Tech / Convention / Env / Config, etc.). Omit this section if empty. -->

| Type   | Item   | Note   |
| ------ | ------ | ------ |
| {Type} | {item} | {note} |

## Constraints

<!-- Phase 1 OUTCOME plus Phase 2 inherited, and Phase 4 discovered. Omit a row when that category has no constraint. Omit this section when all rows would be empty. -->

| Category   | Constraint   |
| ---------- | ------------ |
| {category} | {constraint} |

## Hypotheses Log (Bug investigation only)

<!-- Phase 5 Strong Inference output. Include only when Intent = Bug investigation. -->

| Hypothesis   | Discriminating test | Result   |
| ------------ | ------------------- | -------- |
| {hypothesis} | {test}              | {result} |

## Same-origin Sweep (Bug investigation, root cause confirmed only)

<!-- Phase 5 sweep output. Include only when a root cause was confirmed. -->

{Introducing commit of the root-cause file and the swept scope}

| Sibling   | Consumer (spec source) | Result   |
| --------- | ---------------------- | -------- |
| {sibling} | {consumer}             | {result} |

## Disconfirmation Check

<!-- Phase 7 output. When Phase 5 ran, write `Covered by Phase 5 elimination`. When skipped, quote command + raw output verbatim from the Phase 4 scratch. Treat 0 hits as possible tool misuse before claiming absence. -->

{When Phase 5 ran, `Covered by Phase 5 elimination`. When skipped, quote command + raw output verbatim and add the cross-check result}

## References

<!-- External docs, issues, and prior research files cited in Findings or Evidence. -->

| Path   | Description   |
| ------ | ------------- |
| {path} | {description} |

## Coverage Notes

<!-- Phase 6 critic-design verdict (or skip reason) and the Phase 7 coverage check. List questions noted as unknown and how to close them, tool disagreements from cross-method verification, and `unverified external claim` findings. -->

- {unknown item and how to close it}
- {tool disagreement, if any}
- {unverified external claim, if any}
- Challenge: {critic-design verdict, or skip reason}

## Next Steps

| Intent             | Next Command |
| ------------------ | ------------ |
| Feature planning   | `/think`     |
| Bug investigation  | `/fix`       |
| Understanding only | complete     |
```
