# MADR: Markdown Architectural Decision Records

MADR is a streamlined markdown template for recording decisions, one file per decision. This file assumes v4. The A expanded to Any in 2022 and back to Architectural in 2024, yet upstream allowed recording any decision throughout; what moved was the focus. This skill steps off the wobbling name by saying DR, covering decisions beyond architecture.

## Required Sections

Confirmation is optional in upstream MADR v4 but treated as required by this skill.

| Section                       | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| Title                         | `# {title}`. Short declarative statement      |
| Context and Problem Statement | Why the decision is being made                |
| Considered Options            | Alternatives examined as a bullet list        |
| Decision Outcome              | Chosen option and the immediate justification |
| Confirmation (under Outcome)  | How to verify implementation matches decision |

## Optional Sections

| Section                      | When to include                             |
| ---------------------------- | ------------------------------------------- |
| Decision Drivers             | Criteria guiding the choice                 |
| Consequences (under Outcome) | `Good, because ...` / `Bad, because ...`    |
| Pros and Cons of the Options | Per-option detail with `### {option}` heads |
| More Information             | Migration plan, triggers, related links     |

## Status Lifecycle

| Status                | Meaning                                |
| --------------------- | -------------------------------------- |
| proposed              | Awaiting review                        |
| accepted              | Approved, implementing or completed    |
| rejected              | Considered but not adopted             |
| deprecated            | Retired without a replacement DR       |
| superseded by DR-NNNN | Replaced by another DR (record the ID) |
