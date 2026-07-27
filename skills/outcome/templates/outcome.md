# OUTCOME Template

Stub template for `.claude/OUTCOME.md`. The `/outcome` skill reads this file during generation and update.

## Template

Each repository's `.claude/OUTCOME.md` follows the structure below. `{...}` is replaced with content at generation time. Behavior is required; Indicators are optional, included only when they sharpen a Behavior and dropped with the heading otherwise. Write TBD for an item you cannot settle; downstream treats a file whose items are all TBD as an absent outcome.

```markdown
# OUTCOME

## Outcome state

{Optional opening prose. The project's reason for being and the direction it evolves toward. Aspirational language allowed.}

### Behavior

{Subject (human user / AI agent / system) holds the named state in the done condition. Implementation-independent. Observable. One bullet per distinct behavior.}

### Indicators

{Optional. States that corroborate the Behavior above. Numeric, temporal, or aspirational direction. Skip the section if none sharpen the Behavior.}

| Indicator  | Value                     | Corroborates            |
| ---------- | ------------------------- | ----------------------- |
| Time       | {bound}                   | {which Behavior bullet} |
| Error rate | {bound}                   | {which Behavior bullet} |
| Value      | {beneficiary holds value} | {which Behavior bullet} |

## Non-goals

{Bullet list. Explicitly out of scope.}

## Constraints

{Bullet list. Immovable technical, legal, or organizational limits.}
```
