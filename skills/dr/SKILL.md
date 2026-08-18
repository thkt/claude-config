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

Take the decision title from `$ARGUMENTS` and shape it into a specific action like "Adopt X for Y". If empty, confirm New decision / Update existing via AskUserQuestion; for Update existing, list recent DRs in `<git-root>/docs/decisions/` for selection (§ Updating an Existing DR). To change the storage location, set the `DR_DIR` env var before running.

## Adoption Gate

Proceed to the process only when all three conditions below hold.

1. Hard to reverse. Changing the decision later carries meaningful cost
2. Surprising without context. A future reader will ask "why this way?"
3. Result of a real trade-off. Genuine alternatives existed and one was picked for specific reasons

When a condition is missing, skip the DR and record the decision where the table says.

| Missing condition | Where it goes                                     |
| ----------------- | ------------------------------------------------- |
| 1 or 2            | A `CONTEXT.md` entry or an equivalent design note |
| 3 alone           | The commit message body                           |

## Process

| Step | Stage      | Actions                                                                                                                                                                                                                                               |
| ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Pre-Check  | Run ${CLAUDE_SKILL_DIR}/scripts/pre-check.py "$TITLE". If `similar_drs` is non-empty, confirm with the user before proceeding. Write the DR under the returned `dr_dir` named `filename`, and carry `number` and `date` into the body and frontmatter |
| 2    | Type       | Determine the decision type by the decision's intent and pick its recommended topics (§ Decision Type)                                                                                                                                                |
| 3    | References | Gather project docs, issues, external resources                                                                                                                                                                                                       |
| 4    | Draft      | Copy ${CLAUDE_SKILL_DIR}/templates/madr-template.md and fill it from what was gathered (§ YAML Frontmatter)                                                                                                                                           |
| 5    | Challenge  | Only for a DR that carves an exception into an existing DR's principle or supersedes one, run `/challenge` and record the verdict and the condition it holds under as one line in More Information                                                    |
| 6    | Validate   | Run ${CLAUDE_SKILL_DIR}/scripts/validate-dr.py "$DR_FILE". exit 0 with an empty `errors[]` passes. `warnings[]` is advisory                                                                                                                           |
| 7    | Index      | Run ${CLAUDE_SKILL_DIR}/scripts/update-index.py to regenerate the index README                                                                                                                                                                        |

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

When the status is proposed, edit the body directly and run Validate and Index. From accepted onward, keep the decision content and replace it with a new DR through the steps below, changing only `status` and `date` in the old one.

1. Create the new DR through the process
2. Cite the predecessor in the new DR's More Information (e.g. `Supersedes DR-NNNN`)
3. In the old DR, change `status:` to `superseded by DR-NNNN`
4. Update the old DR's `date:` to today
5. Run ${CLAUDE_SKILL_DIR}/scripts/update-index.py to refresh the index

## Error Handling

Each script reports its failure as JSON or on stderr. Handle them per the table.

| Error                                    | Treatment                                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Reported as outside a git repository     | Set `DR_DIR` to name the archive explicitly                                                              |
| Reported as an archive holding SKILL.md  | It points at a skill directory, so redirect `DR_DIR` to the archive                                      |
| `similar_drs` is non-empty               | Present the duplicates and confirm whether to proceed or switch to an update (§ Updating an Existing DR) |
| validate-dr.py returns `missing_section` | Restore the dropped heading from the template and run Validate again                                     |

## Output

| Path                                     | Description          |
| ---------------------------------------- | -------------------- |
| `<git-root>/docs/decisions/XXXX-slug.md` | DR file              |
| `<git-root>/docs/decisions/README.md`    | Auto-generated index |

## References

| Topic  | Resource                                      |
| ------ | --------------------------------------------- |
| MADR   | ${CLAUDE_SKILL_DIR}/references/madr-format.md |
| Fowler | ${CLAUDE_SKILL_DIR}/references/fowler-adr.md  |
