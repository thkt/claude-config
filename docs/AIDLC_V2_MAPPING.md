# Mapping to AI-DLC v2

Both directions of a mapping between awslabs/aidlc-workflows v2's stages and this harness's workflows and skills. It reads as the record of what the harness deliberately does not carry, for judging a proposal that would widen its scope.

Measured at upstream `v2` branch `840ba653` (2026-08-22). The stages directory moved four times in the two weeks before that, so check the sha when reading.

## Source

The primary source is the `v2` branch, not `main`. `main` still carries AI-DLC 1.x: three phases and 14 stages in one file. A measurement taken from the default branch describes 1.x.

The authoritative form of a stage definition is the YAML frontmatter of its own file; `stage-graph.json` is compiled from it.

| What                     | Path (branch `v2`)                                          |
| ------------------------ | ----------------------------------------------------------- |
| 33 stage definitions     | `core/aidlc-common/stages/<phase>/<slug>.md`                |
| The frontmatter contract | `core/aidlc-common/protocols/stage-definition.md`           |
| Compiled output          | `dist/{claude,codex,copilot}/…/tools/data/stage-graph.json` |

## Stage count

There are 5 phases, and that is a schema constraint rather than the result of counting directories. `stage-definition.md:50` enumerates `initialization | ideation | inception | construction | operation` as the field's value set.

The stages numbered 32 on 2026-08-08 and 33 at `840ba653`. The delta is one split, not an addition: `inception/application-design.md` became `domain-design.md` and `contract-design.md` (`74a51a10`, 2026-08-13).

| At                      | initialization | ideation | inception | construction | operation | Total |
| ----------------------- | -------------- | -------- | --------- | ------------ | --------- | ----- |
| `5f6b310f` (2026-08-08) | 3              | 7        | 7         | 7            | 7         | 32    |
| `840ba653` (2026-08-22) | 3              | 7        | 9         | 7            | 7         | 33    |

## The matching rule

**matched** holds only when both do: the same activity triggers it, and the local side produces an artifact filling a role in that stage's `produces[]`. Name similarity never counts.

**partial** holds when one of the two does. **unmatched** holds when neither does.

## From v2's stages

Of the 33 stages, 4 matched, 8 partial, 21 unmatched.

That every one of the 7 OPERATION stages is unmatched was checked by sweeping `workflows/` and `skills/` for `deploy|observab|incident|rollback|provision`. All 20 hits outside `tests/` are something else: the adjective "observable", a template prompting for a rollback risk, a list of directories to search, and code samples.

| #   | Stage                    | Verdict   | Local counterpart                                                                                                                     |
| --- | ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | workspace-scaffold       | unmatched | -                                                                                                                                     |
| 0.2 | workspace-detection      | unmatched | -                                                                                                                                     |
| 0.3 | state-init               | unmatched | `workflows/_lib/run-workflow.js` holds per-run state, but that is plumbing rather than a stage                                        |
| 1.1 | intent-capture           | partial   | `/outcome`'s Outcome state fills intent-statement. No stakeholder-map                                                                 |
| 1.2 | market-research          | unmatched | -                                                                                                                                     |
| 1.3 | feasibility              | partial   | `/challenge` returns GO / NO-GO. OUTCOME.md § Constraints is the constraint-register                                                  |
| 1.4 | scope-definition         | partial   | OUTCOME.md § Non-goals is the scope-document. `/slice` builds a backlog, but from a plan rather than an intent                        |
| 1.5 | team-formation           | unmatched | -                                                                                                                                     |
| 1.6 | rough-mockups            | unmatched | -                                                                                                                                     |
| 1.7 | approval-handoff         | partial   | `/issue` produces the handoff artifact and `/dr` the decision-log. Neither gates the other                                            |
| 2.1 | reverse-engineering      | partial   | `/research`'s sourced report and `/census`'s inventory of unrecorded decisions                                                        |
| 2.2 | practices-discovery      | matched   | `/scribe` extracts rules from closed PRs / issues and research output, verifies them against the code, and lands them in `docs/wiki/` |
| 2.3 | requirements-analysis    | unmatched | No local artifact class holds requirements                                                                                            |
| 2.4 | user-stories             | unmatched | -                                                                                                                                     |
| 2.5 | refined-mockups          | unmatched | `reviewer-accessibility` inspects built UI and produces no design artifact                                                            |
| 2.6 | domain-design            | partial   | `/dr` fills decisions in MADR v4. No component model                                                                                  |
| 2.7 | units-generation         | matched   | `/slice` cuts a plan into vertical slices and publishes them in dependency order                                                      |
| 2.8 | contract-design          | unmatched | -                                                                                                                                     |
| 2.9 | delivery-planning        | partial   | `/think` produces a plan carrying units. No allocation or sequencing-rationale                                                        |
| 3.1 | functional-design        | partial   | `/think`'s plan is design-level but is not a functional spec, and it lives in an issue's `## Plan` section                            |
| 3.2 | nfr-requirements         | unmatched | Reviewers inspect after the code exists. No requirement artifact                                                                      |
| 3.3 | nfr-design               | unmatched | -                                                                                                                                     |
| 3.4 | infrastructure-design    | unmatched | -                                                                                                                                     |
| 3.5 | code-generation          | matched   | `workflows/code.js` implements per unit under Red → Green                                                                             |
| 3.6 | build-and-test           | matched   | The Verify stage of `code.js` and `build.js`                                                                                          |
| 3.7 | ci-pipeline              | unmatched | CI exists, but no workflow or skill generates it                                                                                      |
| 4.1 | deployment-pipeline      | unmatched | -                                                                                                                                     |
| 4.2 | environment-provisioning | unmatched | -                                                                                                                                     |
| 4.3 | deployment-execution     | unmatched | -                                                                                                                                     |
| 4.4 | observability-setup      | unmatched | -                                                                                                                                     |
| 4.5 | incident-response        | unmatched | -                                                                                                                                     |
| 4.6 | performance-validation   | unmatched | -                                                                                                                                     |
| 4.7 | feedback-optimization    | unmatched | `workflows/adrift.js` reports drift, but between DRs and code rather than in a running system                                         |

## From the harness

Of 7 workflows and 16 lifecycle skills, 4 matched, 10 partial, 9 unmatched of 23. The 11 `use-*` skills are context loaders with no stage to compare against, so they stay out of the denominator.

| Local unit            | Verdict   | v2 counterpart                                                                                     |
| --------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `workflows/build.js`  | matched   | A construction run under the conductor (3.5 + 3.6). Its Branch / Ship half has none                |
| `workflows/code.js`   | matched   | 3.5 code-generation (`for_each` unit)                                                              |
| `workflows/audit.js`  | partial   | `stage-protocol-reviewer.md`'s two-party critique is per stage, not a reviewer fan-out over a diff |
| `workflows/assert.js` | partial   | The same reviewer protocol plus the artifact guard. No independent merge-readiness verdict         |
| `workflows/adrift.js` | unmatched | v2's `traceability` sensor is forward coverage, not decay against recorded decisions               |
| `workflows/polish.js` | unmatched | -                                                                                                  |
| `workflows/shake.js`  | unmatched | -                                                                                                  |
| `/scribe`             | matched   | 2.2 practices-discovery                                                                            |
| `/slice`              | matched   | 2.7 units-generation                                                                               |
| `/census`             | partial   | 2.2 discovers rules from a repository; census discovers unrecorded decisions                       |
| `/challenge`          | partial   | 1.3 feasibility                                                                                    |
| `/dr`                 | partial   | 2.6 domain-design's decisions                                                                      |
| `/fix`                | partial   | v2 carries `bugfix` as a scope (a stage-selection filter), not as a stage                          |
| `/issue`              | partial   | 1.7 approval-handoff                                                                               |
| `/outcome`            | partial   | 1.1 intent-capture                                                                                 |
| `/research`           | partial   | 2.1 reverse-engineering, 1.2 market-research                                                       |
| `/think`              | partial   | 2.9 delivery-planning, 3.1 functional-design                                                       |
| `/checkout`           | unmatched | -                                                                                                  |
| `/commit`             | unmatched | -                                                                                                  |
| `/pr`                 | unmatched | -                                                                                                  |
| `/preview`            | unmatched | -                                                                                                  |
| `/qualify`            | unmatched | -                                                                                                  |
| `/transcribe`         | unmatched | -                                                                                                  |

## What the asymmetry shows

v2 crosses the lifecycle once. Its 33 stages sit in a `requires_stage` DAG, `display_order` is computed from it, and a person approves each stage once.

The harness has no lifecycle graph. Its 7 workflows are each invoked on their own, and 5 of them (`audit`, `assert`, `polish`, `shake`, `adrift`) are assurance passes re-entered over the same construction and review band. `build.js` and `code.js` name a predecessor in prose ("write its `## Plan` via /think + /issue and relaunch", "as produced by the think skill"), but those are preconditions a person satisfies. Nothing corresponds to `requires_stage`, and no engine refuses to start.

The breadth-versus-depth difference reads as numbers in the verification layer.

The difference is what puts a proposal to widen the scope toward ideation or operations off the OUTCOME axis. `.claude/OUTCOME.md` § Constraints binds the harness to Claude Code's hook / skill / plugin surface. v2's engine (`aidlc-orchestrate.ts`, `aidlc-state.ts`, a compiled stage graph) sits outside that surface, so a v2 stage does not port as a stage.

|                                            | v2       | The harness                               |
| ------------------------------------------ | -------- | ----------------------------------------- |
| Deterministic sensors                      | 6 kinds  | 18 reviewers + 3 critics                  |
| Stages carrying only document-shape checks | 19 of 33 | -                                         |
| Stages carrying `linter` / `type-check`    | 7        | -                                         |
| What one audit runs                        | -        | reviewer → challenge → verify → integrate |

## Reading it again

The `v2` branch moved four times in two weeks in the stages directory alone. This table is the snapshot at `840ba653`; re-reading it starts by counting the stages again.

The tags do not help. `v2.1.1` through `v2.3.0` belong to the v2 train itself, but `package.json` reads `0.0.0` at every one and no release exists. The version a reader can act on lives in commit subjects (`(2.6.55)`), nowhere else.
