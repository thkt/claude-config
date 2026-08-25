---
paths:
  - "CLAUDE.md"
  - ".claude/CLAUDE.md"
  - "docs/decisions/**"
  - "docs/wiki/**"
  - "rules/**"
  - ".claude/rules/**"
---

# Document Responsibilities

Settle which document a newly written thing goes into. Four documents divide the ground between them so the same content never lands in two places.

| Document          | Domain                                                                                  | Lifecycle                          | Why a reader opens it              |
| ----------------- | --------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| `rules/`          | Language and domain directives, always applied                                          | Living document                    | What must I obey?                  |
| `docs/decisions/` | Decisions: rationale and the alternatives considered                                    | Immutable. Replaced by supersession | Why this shape? May I overturn it? |
| `CLAUDE.md`       | Project-specific current state and the reason for it                                    | Living document                    | What is this project?              |
| `docs/wiki/`      | Implementer-facing current state: repeated procedures and conventions, module boundaries and contracts | Living document | How do I do this today?            |

## Routing

1. The rule itself goes to `rules/`. The rationale for choosing that rule goes to a decision record
2. A decision record declares `scope:` in its frontmatter
3. When a same-scope cluster spans repositories and is still open, write the common directive into `rules/` and cross-link it from the source records. The source records stay in place as the historical rationale, which keeps decision records immutable
4. Project-specific state goes to `CLAUDE.md`. State that generalizes across projects is promoted to a decision record or to `rules/`
5. The wiki states the present shape a decision produced. It writes down neither the record's rationale nor its alternatives, and names the record in the 由来 section instead
6. A wiki page names a record in 由来 only when the counterfactual test holds: were that record replaced, would this page need rewriting? Only Yes adds the link
7. When a record is replaced, the pages naming it in 由来 are rewritten in the same change unit. Relinking is not enough; check whether the body still holds
8. The wiki's 共通項 pages are extracted from past PRs and issues. A `kind: structure` page covers one glob-able contract group, raised from the decision records and the code, then reviewed by a human

## When two documents overlap

The same directive sitting in both `rules/` and a record that has not been superseded means one of two things. Either the record holds the historical rationale for the current `rules/` entry, or the two have diverged and need reconciling. Cross-link for the first; resolve the divergence for the second.

The wiki is a copy derived from the decision records. The record is canonical, and the 由来 section is where the copy records where the canonical lives. What the copy carries is the decision's present shape, not the record's text.
