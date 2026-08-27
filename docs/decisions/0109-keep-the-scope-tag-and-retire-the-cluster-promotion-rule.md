---
status: "proposed"
date: "2026-08-27"
decision-makers: thkt
scope: [meta, documentation]
---

# Keep the scope tag and retire the cluster-promotion rule

## Context and Problem Statement

DR-0067 placed three rules on the `scope:` tag. Rule 1 splits the rule from its rationale, rule 2 asks every new DR to declare `scope:`, and rule 3 fires when the same scope clusters across repositories: the common directive moves into `rules/` and the source records cross-link to it. DR-0106 recorded that two of DR-0067's three Confirmation checks cannot be evaluated and left the tag's fate open.

Measured on 2026-08-27 against 108 DRs.

| Item | Measurement |
| --- | --- |
| DRs carrying `scope:` | 8 of 108. DR-0090 through DR-0105 carry none; DR-0106, DR-0107, and DR-0108 all carry one |
| Largest cluster | `meta`, 5 occurrences. Every other tag appears once or twice |
| `audit-adr-scopes.py` | Absent. `skills/audit-undocumented/` does not exist in the tree |
| DR references inside `rules/` | 1 across all files |

The last row is the load-bearing one. Rule 3 ends in a cross-link from the promoted directive back to its source records, and there is one DR reference in the whole of `rules/`. No directive has ever been promoted along this path.

## Decision Drivers

- A rule that has never fired in 108 records either lacks a mechanism or lacks an occasion, and the two call for opposite repairs
- DR-0106's Reassessment Trigger "the scope-tag mechanism is revived or retired" stays open until this is settled, and rules 1-4 need restating either way
- `rules/` is where a directive lands, so a promotion rule that produces no `rules/` entry produces nothing observable

## Considered Options

- Retire the tag entirely, dropping rules 2 and 3
- Revive both, by reimplementing the aggregation script or folding it into `census`
- Keep rule 2, retire rule 3

## Decision Outcome

Chosen option: "Keep rule 2, retire rule 3".

Rule 2 costs one frontmatter line and resumed on its own with DR-0106. It carries the scope forward for whoever later wants the aggregation, and nothing is lost by leaving it in place.

Rule 3 is retired for three independent reasons. Its trigger reads "spans repositories", and this is one repository, so the condition cannot arise here. Its report comes from a script that was never written. And its endpoint is a `rules/` entry cross-linked to its sources, of which there is one in the tree after 108 records.

### Consequences

- `rules/conventions/DOCUMENTS.md` item 3 is removed. Where a directive belongs stays governed by items 1 and 2
- DR-0067's Confirmation checks 1 and 2 stop being evaluated. Check 3 (new DRs declare `scope:`) stands and is met by the last three records
- A cross-repository aggregation, if it is ever wanted, starts from the tag data rule 2 keeps accumulating rather than from nothing

### Confirmation

- `rules/conventions/DOCUMENTS.md` carries no item asking for a cluster-driven promotion
- A DR created after this one carries `scope:` in its frontmatter

## Pros and Cons of the Options

### Retire the tag entirely

- Good, because it removes the last unevaluated Confirmation check
- Bad, because the 8 records that carry a tag lose their meaning, and reviving aggregation later starts from zero

### Revive both

- Good, because DR-0067's design becomes observable for the first time
- Bad, because the trigger is cross-repository and this is one repository, so the reimplemented script would report on a population that cannot cluster
- Bad, because `census` already mines undocumented decisions and `adrift` already watches DR-to-code drift. Neither is scope aggregation, and a third mechanism needs its own occasion

### Keep rule 2, retire rule 3

- Good, because the half that runs keeps running and the half that never ran stops being an unevaluated check
- Bad, because the tag accumulates with no consumer, which is a cost paid now against a use that may never arrive

## More Information

### Reassessment Triggers

- A second repository adopts this DR set, which restores the cross-repository condition rule 3 rested on
- The `meta` cluster reaches a size where a common directive is visible by reading the records alone
