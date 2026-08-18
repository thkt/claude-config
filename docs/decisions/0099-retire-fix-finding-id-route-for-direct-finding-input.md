---
status: "accepted"
date: "2026-08-18"
decision-makers: "thkt"
---

# Retire fix's Finding ID route in favor of Direct Finding Input

## Context and Problem Statement

ADR-0077 gave `/fix` a Finding ID route: hand it `RC-001`, and fix reads the latest audit snapshot from `~/.claude/history/`, finds the ID in `findings[]`, and routes by the finding's `severity` and `fix_type`. That decision assumed snapshot findings carry an `id` and a `fix_type`.

Neither field survives in the current schema. The six most recent audit snapshots carry `file`, `line`, `severity`, `source_ids`, and `summary`, and nothing else. Across 113 JSON snapshots, 44 hold an `id` and 69 do not; none of the six most recent do. `enhancer-integration.md` § Auto-fix marking states outright that no `fix_type` field exists, and `skills/fix/tests/finding-routing.test.js` already asserts fix does not branch on it. The `id` half went unnoticed.

So the route cannot resolve anything an audit produces today. It reads a directory only fix reads, against a field the writer stopped emitting.

## Decision Drivers

- The route resolves against a field current snapshots do not carry
- Resolving against "the latest snapshot" is ambiguous once a second audit runs, because IDs are numbered per run
- Direct Finding Input takes exactly the fields the snapshot does carry
- `~/.claude/history/` has one reader and one writer, and the reader is the broken half

## Considered Options

- Option 1: Retire the Finding ID route and keep Direct Finding Input
- Option 2: Retire both finding routes and take audit findings through `/issue`, matching build's input
- Option 3: Restore `id` in the audit snapshot schema so ADR-0077's routing works again

## Decision Outcome

Option 1.

Direct Finding Input already accepts `file:line` plus `severity` and `summary`, which is what an audit run hands back, so the audit-to-fix loop stays open with no schema work. Option 2 closes a route that works today and inserts a filing step between audit and fix. Option 3 moves the work to the audit side to revive a convenience whose only gain over pasting the finding is a shorter thing to type.

The severity gate ADR-0077 introduced stays. It now keys off Direct Finding Input alone: `low` / `medium` with a 1-3 line fix goes Obvious, `critical` / `high` or a non-obvious fix goes Non-obvious. That is what keeps a security finding out of the path that skips RCA and regression-test generation.

### Confirmation

`skills/fix/SKILL.md` carries no Finding ID row and no `history/` reference, and `skills/fix/tests/finding-routing.test.js` asserts both absences alongside the severity vocabulary it already checks.

## Consequences

- Good, because the input table stops describing a route that cannot resolve
- Good, because fix no longer reads a directory whose schema it does not control
- Bad, because a finding must be pasted rather than named, which is longer to type
- Bad, because `~/.claude/history/` loses its only reader and becomes write-only

## More Information

Supersedes ADR-0077. ADR-0077's severity gate is kept, not reversed; only the ID resolution and the snapshot read are retired. ADR-0078 aligned the finding atom family on the audit finding schema and stays in force, since Direct Finding Input consumes that same schema.

Re-open this if the audit snapshot schema regains a stable per-finding `id` that is unique across runs, or if a second consumer of `~/.claude/history/` appears.

### References

- ADR-0077 (the routing rule this supersedes)
- ADR-0078 (finding atom family aligned on the audit finding schema)
- `agents/_lib/finding-schema.md` (the fields Direct Finding Input consumes)
