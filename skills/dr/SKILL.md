---
name: dr
description: Create a Decision Record (DR) in MADR v4 format with automatic numbering. Its subject is not limited to architecture; it covers every decision that is hard to reverse and surprising without context.
when_to_use: DR作成, ADR作成, 技術決定, アーキテクチャ決定, decision record
allowed-tools: Read Write Edit LS Bash(mkdir:*) Bash(${CLAUDE_SKILL_DIR}/scripts/*) AskUserQuestion Bash(ugrep:*) Bash(bfs:*)
model: opus
argument-hint: "[decision title]"
---

# /dr - Decision Record Creation

## Input

Take the decision title from `$ARGUMENTS`. If empty, confirm New decision / Update existing via AskUserQuestion. For New decision ask for the title; for Update existing, list recent DRs in `<git-root>/docs/decisions/` for selection (§ Updating an Existing DR). Shape a title you are creating into a specific action like "Adopt X for Y", keeping it 5-64 characters and free of `/:*?"<>|`. The archive defaults to `<git-root>/docs/decisions/`, and the `DR_DIR` env var moves it.

## Adoption Gate

Proceed to the process only when all three conditions below hold. When one is missing, skip the DR and apply the table top to bottom, leaving the decision where the first matching row says.

| Condition                                                                                        | Where it goes when missing                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Hard to reverse. Changing the decision later carries meaningful cost                             | A `CONTEXT.md` entry or an equivalent design note |
| Surprising without context. A future reader will ask "why this way?"                             | A `CONTEXT.md` entry or an equivalent design note |
| Result of a real trade-off. Genuine alternatives existed and one was picked for specific reasons | The commit message body                           |

## Process

| Step | Stage      | Actions                                                                                                                                                                                            |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Pre-Check  | Run ${CLAUDE_SKILL_DIR}/scripts/pre-check.py "$TITLE". What it consumes from the return is `dr_dir` and `filename` (where to write), `date` (frontmatter), and `similar_drs` (duplicate check)     |
| 2    | Type       | Determine the decision type by the decision's intent and pick its recommended topics (§ Decision Type)                                                                                             |
| 3    | References | Gather project docs, issues, external resources                                                                                                                                                    |
| 4    | Draft      | Copy ${CLAUDE_SKILL_DIR}/templates/madr-template.md into `dr_dir` under the name `filename` and fill it from what was gathered (§ YAML Frontmatter)                                                |
| 5    | Challenge  | Only for a DR that carves an exception into an existing DR's principle or supersedes one, run `/challenge` and record the verdict and the condition it holds under as one line in More Information |
| 6    | Validate   | Run ${CLAUDE_SKILL_DIR}/scripts/validate-dr.py "$DR_FILE". exit 0 passes. What failed lands in `errors[]`, and `warnings[]` is advisory                                                            |
| 7    | Index      | Run ${CLAUDE_SKILL_DIR}/scripts/update-index.py to regenerate `dr_dir/README.md`                                                                                                                   |

## Decision Type

The decision type only affects which recommended More Information topics to include. Per-section guidance is common to all types: Context 3 lines, Options 3-5 lines each, Consequences 2-3 bullets.

| Decision type        | Use Case                   | Line limit | Recommended topics                                                            |
| -------------------- | -------------------------- | ---------- | ----------------------------------------------------------------------------- |
| technology-selection | Library, framework choices | 80 lines   | Migration Strategy, Rollback Plan, Success Criteria                           |
| architecture-pattern | Structure, design policy   | 80 lines   | Architecture Diagram, Quality Attributes, Trade-offs                          |
| process-change       | Workflow, rule changes     | 100 lines  | Before / After comparison, Transition Plan, Review Schedule                   |
| deprecation          | Retiring technology        | 100 lines  | Deprecation Target, Migration Plan, Deprecation Warning Period, Rollback Plan |

## YAML Frontmatter

The frontmatter is optional. When it is written, it uses the fields below.

| Field           | Notes                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| status          | Pick from the Status lifecycle in ${CLAUDE_SKILL_DIR}/references/madr-format.md. YAML quotes required; no links |
| date            | YYYY-MM-DD of creation; updated only when the DR is superseded                                                  |
| decision-makers | List of names or roles. Renamed from `deciders` in v4                                                           |
| consulted       | Subject-matter experts; two-way exchange                                                                        |
| informed        | Stakeholders kept up-to-date; one-way                                                                           |

## Updating an Existing DR

When the status is proposed, edit the body directly and run Validate and Index. From accepted onward, replace it with a new DR through the steps below. Only `status` and `date` change in the old DR; the decision content stays.

1. Create the new DR through the process
2. Cite the predecessor in the new DR's More Information (e.g. `Supersedes DR-NNNN`)
3. In the old DR, change `status:` to `superseded by DR-NNNN`
4. Update the old DR's `date:` to today
5. Run ${CLAUDE_SKILL_DIR}/scripts/update-index.py to refresh the index

## Error Handling

Each script reports its failure as JSON or on stderr. Handle them per the table.

| Error                                   | Treatment                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Reported as outside a git repository    | Set `DR_DIR` to name the archive explicitly                                                              |
| Reported as an archive holding SKILL.md | It points at a skill directory, so redirect `DR_DIR` to the archive                                      |
| `similar_drs` is non-empty              | Present the duplicates and confirm whether to proceed or switch to an update (§ Updating an Existing DR) |
| `errors[]` comes back non-empty         | Fix what it names and run Validate again                                                                 |

## References

| What you are unsure of                      | Resource                                      |
| ------------------------------------------- | --------------------------------------------- |
| Whether to keep or drop an optional section | ${CLAUDE_SKILL_DIR}/references/madr-format.md |
| What it takes to explain a decision fully   | ${CLAUDE_SKILL_DIR}/references/fowler-adr.md  |
