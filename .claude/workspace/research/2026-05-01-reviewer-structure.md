# Research: reviewer-structure

Generated: 2026-05-01
Session: 8644451e-8804-49d5-8dbe-6e9528364470
Intent: Understanding
Domain: General
Prior research: none found (slug `reviewer-structure`. Closest existing memory: `project_reviewer-restructuring-backlog.md` from 2026-05-01, inherited as baseline)

## Purpose

Map the current reviewer architecture in `~/.claude/agents/reviewers/` and `~/.claude/skills/use-context-reviewer-*` after the 2026-05-01 restructuring, identify active ADR-0058 reassessment triggers, and reconcile the 6-day-old wrapper-rationale memory with current state.

## Key Findings

| Priority | Finding | Source | Next Action |
| --- | --- | --- | --- |
| 1 | strictness skill is single consumer (1: reviewer-strictness only). ADR-0058 reassessment trigger is currently active (multi-consumer skill that became single). | grep verification: `grep -l "use-context-reviewer-strictness" agents/**/*.md` returned only `reviewer-strictness.md` | Execute homework 1 (inline `use-context-reviewer-strictness` body into `reviewer-strictness.md`, remove skill dir, update marketplace.json, mirror to .ja/) per `/Users/thkt/.claude/projects/-Users-thkt--claude/memory/project_reviewer-restructuring-backlog.md:11-16` |
| 2 | readability skill dropped from 4 to 2 consumers (now: enhancer-code, reviewer-readability). Still DRY-justified per ADR-0058 threshold (>=2) but on the boundary. | grep verification of `use-context-reviewer-readability` | Watch for further drop. If single-consumer, ADR-0058 trigger fires. |
| 3 | All 20 reviewers have uncommitted refactor: `context: fork` field removed uniformly. Three reviewers also dropped `skills:` references: reviewer-document (lost readability), reviewer-encapsulation (lost strictness), reviewer-spec (lost readability, kept spec-validation). | `git diff HEAD -- agents/reviewers/` skill+context churn | Confirm whether the `context: fork` removal is intentional architectural change or oversight before commit |
| 4 | Eight reviewers never had a `skills:` field (design, duplication, efficiency, operations, progressive, prompt, resilience, reuse). Pattern: agents that don't need orchestrated knowledge injection - content is fully inline. | `git show HEAD:agents/reviewers/reviewer-<name>.md \| grep "^skills:"` for each returns "(no skills in HEAD)" | None - confirmed self-contained by design |
| 5 | Of 20 reviewers, 10 declare a `skills:` field after the refactor. Splits: 6 use-context-reviewer-* skills + use-context-root-cause-analysis (causation) + use-workflow-tdd-cycle (coverage, testability) + use-workflow-spec-validation (spec) + a11y-specialist-skills:reviewing-a11y (accessibility) | grep `^skills:` over `agents/reviewers/*.md` | None - descriptive |
| 6 | All 6 `use-context-reviewer-*` skills have `user-invocable: false` and `agent: reviewer-*`. Wrapper-rationale memory (6 days old) describing path 1 (user direct invocation) is partially superseded by ADR-0058 ("user-invocable とは完全切り離し設計を確定"). The 18 `reviewing-* / *-reviewer` pair structure no longer exists in current EN/.ja directories. | `grep "user-invocable:" /Users/thkt/.claude/skills/use-context-reviewer-*/SKILL.md` returned `false` for all 6 | None - wrapper rationale should be re-evaluated. Single-consumer wrappers no longer protect a path 1; only knowledge injection (path 2) remains as load-bearing |
| 7 | `.claude-plugin/marketplace.json` still registers all 6 `use-context-reviewer-*` skills. No drift relative to filesystem. | `grep "use-context-reviewer" .claude-plugin/marketplace.json` returns 6 entries | When inlining strictness, also remove that path |
| 8 | `.ja/` mirror is structurally divergent. EN uses `reviewer-*` agent names + `use-context-reviewer-*` skills. JP mirror uses `*-reviewer` agent names (e.g., `type-safety-reviewer.md`) + `use-context-*-reviewer` skills (e.g., `use-context-type-safety-reviewer`). Naming pattern not aligned. | `ls /Users/thkt/.claude/.ja/agents/reviewers/` and `ls /Users/thkt/.claude/.ja/skills/` | Decide: re-align .ja naming to EN canonical, or accept divergence as language-local convention. Currently unknown which is intended. |
| 9 | Audit pipeline (skills/audit/SKILL.md) routes by file pattern to specific reviewers. Quality focus includes 13 reviewers. The 3 reviewers that lost their skill reference (document, encapsulation, spec) remain in audit routing. | `grep "reviewer-" /Users/thkt/.claude/skills/audit/SKILL.md` shows file routing tables | None - routing unaffected by skill-field removal |
| 10 | Memory homework 2 (reviewer integration candidates) lists duplication+reuse as "most likely" pair but flagged "重複コストが顕在化してないので緊急度低い". Currently no signal to escalate. | `feedback_skill-sharing-content-fit.md` and `project_reviewer-restructuring-backlog.md:18-26` | Defer until concrete duplication cost emerges |

## Available Data

| Type | Item | Note |
| --- | --- | --- |
| Directory | `/Users/thkt/.claude/agents/reviewers/` | 20 reviewer agent files |
| Directory | `/Users/thkt/.claude/skills/use-context-reviewer-*` | 6 reviewer-context skills, all `user-invocable: false` |
| Directory | `/Users/thkt/.claude/.ja/agents/reviewers/` | 20 mirror agents with different naming pattern |
| Directory | `/Users/thkt/.claude/.ja/skills/` | Includes 6 `use-context-*-reviewer` skills (different naming from EN) |
| ADR | `docs/decisions/0058-inline-single-consumer-agent-context-skills-into-agents.md` | Establishes DRY threshold >= 2; defines reassessment triggers |
| ADR | `docs/decisions/0012-flatten-audit-pipeline-remove-compound-reviewers.md` | Sub-reviewer specialization classification (Irreplaceable 7, Partial 4, Replaceable 2) |
| Memory | `project_reviewer-restructuring-backlog.md` | Open homework 1 (strictness inline) + homework 2 (consolidation candidates) |
| Memory | `feedback_skill-sharing-content-fit.md` | Content-fit > consumer count for DRY judgment |
| Memory | `reference_skill-agent-wrapper-rationale.md` (6 days old, flagged stale) | Path 1 / Path 2 invocation rationale, partially superseded by ADR-0058 |
| Config | `.claude-plugin/marketplace.json` | Registers all 6 reviewer skills |
| File | `skills/audit/SKILL.md` | File routing table mapping file patterns to reviewer subsets |

## Constraints

| Category | Constraint |
| --- | --- |
| Architecture | ADR-0058 sets DRY threshold >= 2 consumers for `use-context-*` skills. Single-consumer skills should be inlined. |
| Architecture | When inlining, mirror changes to .ja/ and update marketplace.json, per established procedure for the 4 already-inlined reviewers (performance, security, silence, testability). |
| Naming | EN canonical: `reviewer-<concept>` agents + `use-context-reviewer-<concept>` skills. .ja/ uses different pattern but is in mirror role. |
| Content-fit | Per memory `feedback_skill-sharing-content-fit.md`, before sharing a skill across multiple agents, verify the skill content matches each agent's responsibilities (not just nominal frontmatter reference). |

## Disconfirmation Check

Searched for evidence that strictness skill should NOT be inlined despite single-consumer status: examined whether `enhancer-code.md`, `team-implementation.md`, `team-qa.md`, or any other agent might gain it as a future consumer.

Result: Not found. `enhancer-code` uses `use-context-reviewer-readability` (different concern). No file in `agents/` declares any future intent toward strictness. `feedback_skill-sharing-content-fit.md` explicitly notes "encapsulation の責務 (invariant/encapsulation/modeling) と fit ほぼなし", confirming encapsulation was correctly de-referenced. ADR-0058 trigger condition is met cleanly.

Counter-evidence search: examined whether the wrapper-rationale (path 1 user-direct via skill auto-load) could re-justify keeping strictness as a separate skill. Result: `user-invocable: false` plus ADR-0058 statement "user 確認済: user-invocable とは完全切り離し設計を確定" rules out path 1. Kept-skill rationale would have to come solely from DRY (path 2), and DRY does not apply at consumer count = 1.

## References

| Path | Description |
| --- | --- |
| `/Users/thkt/.claude/docs/decisions/0058-inline-single-consumer-agent-context-skills-into-agents.md` | ADR establishing DRY >= 2 threshold |
| `/Users/thkt/.claude/docs/decisions/0012-flatten-audit-pipeline-remove-compound-reviewers.md` | Sub-reviewer specialization classification |
| `/Users/thkt/.claude/projects/-Users-thkt--claude/memory/project_reviewer-restructuring-backlog.md` | Outstanding homework |
| `/Users/thkt/.claude/projects/-Users-thkt--claude/memory/feedback_skill-sharing-content-fit.md` | Content-fit doctrine for DRY judgment |
| `/Users/thkt/.claude/projects/-Users-thkt--claude/memory/reference_skill-agent-wrapper-rationale.md` | 6-day-old wrapper rationale (partially superseded) |
| `/Users/thkt/.claude/skills/audit/SKILL.md` | Audit pipeline routing tables |
| `/Users/thkt/.claude/skills/use-context-reviewer-strictness/SKILL.md` | Single-consumer skill targeted by homework 1 |

## Coverage Notes

All findings sourced. One unknown remains:

- `.ja/` naming convention divergence: unknown whether intentional (language-local convention) or refactor lag. Resolve by checking origin commit for .ja/ skills with `git log --all -- .ja/skills/use-context-*-reviewer/` or asking user. Listed in Findings #8 as "currently unknown which is intended".

## Next Steps

| Intent | Next Command |
| --- | --- |
| Feature planning | `/think` |
| Bug investigation | `/fix` |
| Understanding only | complete |
