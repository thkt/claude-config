---
name: adrift
description: Scan ADR Decision Outcome sections against current code and report drift with modification direction and priority. Do NOT use for repos without ADRs (use census instead).
when_to_use: ADR と コードの整合性確認, ADR drift, ADR vs code, ADR audit, 意思決定の風化チェック, decision record divergence
allowed-tools: Read Write LS Bash(mkdir:*) Bash(date:*) Bash(python3:*) Bash(ugrep:*) Bash(bfs:*) Task AskUserQuestion
model: opus
argument-hint: "[adr-directory]"
---

# /adrift - ADR vs Code Drift Scanner

Scan each ADR's Decision Outcome section against the current codebase. Record drift with `file:line`, modification direction, and priority so ADRs can serve as a usable refactoring baseline.

## Input

`$ARGUMENTS` may contain a single ADR directory path. Trim whitespace and treat an empty string as auto-detect (Phase 1). If non-empty, treat the value as a path relative to repo root and reject if it does not exist.

## Phase 1: ADR Detection

Treat only `docs/decisions/` (MADR-style) as the ADR directory. If it does not exist, treat the repo as having no ADRs and abort with "No ADRs found, run /census first". Use a different path only when `$ARGUMENTS` specifies one explicitly.

## Phase 2: Status Extraction

Parse each ADR's front matter or top section for Status. Map Superseded ADRs to their successor via `Superseded by [...]` link.

## Phase 3: Decision Outcome Symbol Extraction

Extract code-identifiers (function names, type names, module names, file paths) and bullet-point decisions from the `## Decision Outcome` section (fall back to `## Decision` for older MADR). Skip prose-only ADRs (record as "unverifiable, prose-only").

## Phase 4: Reference Search

For each extracted symbol, apply the following.

- `ugrep -r "<symbol>"` for literal matches
- Filter out the ADR file itself and test fixtures

### External ADR Cross-Check

Run `python3 ${CLAUDE_SKILL_DIR}/../_lib/external-adr-refs.py --adr-dir <adr-dir> --json`. It matches `ADR-NNNN` references across the codebase against the `NNNN-*.md` files in the ADR directory detected in Phase 1 and returns ids with no local match as `external_refs`. Record these as External ADR dependencies in a separate section. This catches the case where a meta ADR lives in a different repo (e.g., a shared `dotclaude` config) and has not been promoted locally.

## Phase 5: Reviewer Selection

Detect repo language by manifest file and run the matching reviewer subagents via Task tool. Subagents receive the candidate `file:line` list plus the ADR Decision Outcome text. They flag semantic gaps clippy or grep cannot detect.

| Manifest                  | Reviewer subagents to spawn              |
| ------------------------- | ---------------------------------------- |
| Cargo.toml                | reviewer-rust + reviewer-design          |
| package.json              | reviewer-design                          |
| package.json with `*.tsx` | reviewer-react-pattern + reviewer-design |
| Other / Unknown           | reviewer-design                          |

## Phase 6: Modification Direction

| Direction    | When                                                 |
| ------------ | ---------------------------------------------------- |
| `code-fix`   | ADR is the correct contract; code drifted            |
| `adr-update` | Code is the correct contract; ADR is stale           |
| `accept`     | Drift is cosmetic, deprecated comment, or documented |

## Phase 7: Priority

| Priority | Criteria                                          |
| -------- | ------------------------------------------------- |
| H        | Public API affected, or 2+ downstream consumers   |
| M        | Internal API affected, single downstream consumer |
| L        | Comment / doc-string only, or dead reference      |

## Phase 8: Report Output

Write the report following `${CLAUDE_SKILL_DIR}/templates/report-template.md`, substituting placeholders from findings. After writing, print a console summary: ADR count, finding count, per-priority count breakdown, unverifiable count.

```bash
mkdir -p docs/audit
STAMP=$(date -u +%Y-%m-%d-%H%M%S)  # UTC date + HHMMSS; same-day reruns never collide
REPORT="docs/audit/${STAMP}-adr-drift.md"
```

## Hand-off

- Print the H-priority follow-up candidates and offer to invoke `/issue` for each
- This skill focuses on drift detection and reporting; hand off `adr-update` findings and ADR body edits to `/adr`
- Code fixes are separate work. Use `/census` to discover areas with no ADR

## Completion Criteria

Finish only when all of the following hold. Record the reason for any unmet item in the report.

| Item     | Condition                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Report   | `docs/audit/<YYYY-MM-DD>-<HHMMSS>-adr-drift.md` exists                                                                                 |
| Per-ADR  | Every ADR is accounted for in Per-ADR Findings (drift / unverifiable as individual subsections, no drift may be batched into one line) |
| Findings | Every drift records file:line / direction / priority                                                                                   |
| Status   | Superseded ADRs reflect `Superseded` in Status                                                                                         |
| External | External ADR references, if any, recorded in External ADR Dependencies                                                                 |
