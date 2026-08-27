# Research: aidlc-workflows-v2-stage-mapping

Generated: 2026-08-23
Session: d7df9978-60c2-45d9-89a7-25411a81a9ef
Intent: Understanding
Domain: General
Prior research: none found

## Purpose

Establish the primary source for awslabs/aidlc-workflows v2's phase and stage list, inventory the local `workflows/*.js` and `skills/*/SKILL.md` set, and match the two in both directions under a stated rule. Issue #344 asserts "10-12 of 32", "2 of 7", and "all 7 OPERATION stages unmatched" without recording when or against what those numbers were taken.

## Key Findings

| Priority | Finding | Source | Next Action |
| -------- | ------- | ------- | ----------- |
| High | The primary source is branch `v2`, not `main`. `main` still carries AI-DLC 1.x: three phases (INCEPTION / CONSTRUCTION / OPERATIONS) and 14 stages in one 539-line file. Any measurement taken from the default branch describes 1.x, not v2. | `aidlc-rules/aws-aidlc-rules/core-workflow.md:81,291,425` on `main`; `README.md:5` on `main` links "the [v2 branch](https://github.com/awslabs/aidlc-workflows/tree/v2)" and `assets/AI-DLC-Workflows-2.0-Specification.pdf` | Answers "v2 の stage 一覧の一次出典". The docs write-up must cite the `v2` branch by ref. |
| High | Issue #344's "32 stage" was correct on its creation date and is now stale. At `5f6b310f` (the last `v2` commit before 2026-08-08T06:14:17Z, the issue's `createdAt`) the stage files numbered 3 + 7 + 8 + 7 + 7 = 32. At `v2` HEAD they number 33. | `gh api repos/awslabs/aidlc-workflows/git/trees/5f6b310f...?recursive=1` filtered to `core/aidlc-common/stages/`, counted per phase directory; same count on `v2` HEAD | Answers "いつ何を見て測られたか". Record both numbers with their commits so a reader cannot read one as wrong. |
| High | The 32 → 33 delta is one stage split, not a stage addition. `inception/application-design.md` became `inception/domain-design.md` + `inception/contract-design.md` in commit `74a51a10` (2026-08-13), "feat: domain-design + contract-design restructure; infra-design consolidation (v2.6.1) (#711)". | Tree diff of `core/aidlc-common/stages/inception/` between `5f6b310f` and `v2` HEAD; `gh api repos/awslabs/aidlc-workflows/commits?sha=v2&path=core/aidlc-common/stages` | Feeds the snapshot note in the docs table. |
| High | "5 phase" is the spec's own framing, not an artifact of counting directories. The authoritative stage-frontmatter contract enumerates the `phase` field's exact value set. | `core/aidlc-common/protocols/stage-definition.md:50` (`initialization \| ideation \| inception \| construction \| operation`) and `:81` (phase prefix `initialization=0, ideation=1, inception=2, construction=3, operation=4`) on `v2` | Answers "5 phase" being load-bearing. Record only. |
| High | The stage list's canonical form is the per-stage YAML frontmatter; `stage-graph.json` is a compiled artifact of it. Cite the stage files and use the JSON as corroboration, never alone. | `core/aidlc-common/protocols/stage-definition.md:8-11`: "YAML frontmatter at the top of every stage `.md` is authoritative … compiles `{{HARNESS_DIR}}/tools/data/stage-graph.json` from the YAML sources" | Answers the source-of-truth question. Record only. |
| High | Under the matching rule stated below, 4 of the 33 v2 stages have a local equivalent, 8 more partially overlap, and 21 have none. The issue's "10-12" is the loose band (4 strict + 8 partial = 12); it is a range because no rule was fixed. | Full table in Available Data § v2 → local | Answers the forward direction. Replace the range in the docs write-up with 4 / 8 / 21 plus the stated rule. |
| High | The reverse direction confirms the issue: of the 7 local workflows, exactly `build` and `code` have a v2 equivalent. Of the 16 local lifecycle skills, `scribe` and `slice` do. 4 of 23 comparable local units. | Full table in Available Data § local → v2 | Answers the reverse direction. Record only. |
| High | All 7 OPERATION-phase stages are unmatched, confirmed by search rather than by assertion. A five-term sweep for `deploy\|observab\|incident\|rollback\|provision` over `workflows/` and `skills/` returns 19 files and 20 lines outside `tests/`, and all 20 are incidental: the adjective "observable", a template prompting the author to name a rollback risk, a directory list naming where to search, and code samples. | Sweep and hit-by-hit inspection quoted in Disconfirmation Check | Answers the third issue claim. Record only. |
| Medium | The local skill denominator is 16, not 27. Eleven `use-*` skills are context/CLI loaders (4 `use-cli-*`, 5 `use-context-*`, 2 `use-workflow-*`) with no lifecycle stage to compare against; v2's counterpart to those is the `rules_in_context` / knowledge-loading order inside `stage-protocol.md`, not a stage. | `ls skills/*/SKILL.md` (27 files); `description:` frontmatter line of each | Prevents the reverse-direction ratio from being diluted. Record only. |
| Medium | The asymmetry is breadth versus re-entry. v2 spreads one gated pass across the whole product lifecycle (33 stages, ideation through operation, ordered by a `requires_stage` DAG with `display_order` computed from it, each stage human-approved once). The local harness has no lifecycle graph at all: 7 independently-invoked workflows, 5 of which (`audit`, `assert`, `polish`, `shake`, `adrift`) are assurance passes re-entered over the same construction/review band. | `core/aidlc-common/protocols/stage-definition.md:67,81`; `workflows/*.js` `meta.whenToUse`. Two of the seven name a predecessor in prose (`build.js`: "write its `## Plan` via /think + /issue and relaunch"; `code.js`: "as produced by the think skill"), but those are preconditions a human satisfies. There is no `requires_stage` equivalent and no engine that refuses to start | Answers "数の非対称が示す設計方向の違い". This paragraph is the issue's actual deliverable. |
| Medium | The depth difference is measurable in the verification layer. v2 declares 6 distinct deterministic sensors across 33 stages, and 19 of the 33 carry only the two document-shape checks (`required-sections`, `upstream-coverage`); only 7 stages carry `linter` or `type-check`. The local harness runs 18 reviewer agents and 3 critic agents through a reviewer → challenge → verify → integrate pipeline on every audit. | `stage-graph.json` `sensors` field, counted per stage; `ls agents/reviewers/` (18), `ls agents/critics/` (3); `workflows/audit.js` `meta.phases` | Corroborates the breadth-versus-depth reading with numbers rather than impression. Feeds the docs paragraph. |
| Low | `skills/xlsx/` holds only a `.DS_Store` and no `SKILL.md`; the spreadsheet skill lives at `skills/transcribe/` and declares `xlsx` in its `when_to_use`. The directory is a leftover from a rename and is not a 28th skill. | `ls -la skills/xlsx/`; `skills/transcribe/SKILL.md:2-4` | Resolves the 29-directory / 27-SKILL.md gap. Record only; deleting it is out of #344's scope. |
| Low | The `v2.1.1`–`v2.3.0` git tags belong to the `v2` branch's own train, and no tag names the version the docs table should pin. Their trees carry the v2 layout (`core/`, `dist/`, `harness/`, `plugins/`), not `main`'s `aidlc-rules/`, and `package.json` reads `"version": "0.0.0"` at every one of them. GitHub releases stop at `v1.0.1` because releases are cut from `main`. The version a v2 reader can act on lives in commit subjects (`(2.6.50)`, `(v2.6.1)`), not in a tag or a file. | `gh api .../git/trees/29a31f78...` (the `v2.3.0` tag object's commit); `gh api .../contents/package.json?ref=v2.3.0` → `0.0.0`, same at `v2.1.1` and `v2` HEAD; `gh api .../releases`; `aidlc-rules` matches 0 lines of the `v2` tree listing | Pin the docs table to a `v2` commit sha, not a tag and not a VERSION file. |

## Available Data

### Matching rule

A v2 stage counts as **matched** when both hold: a local workflow or lifecycle skill is invoked by the same activity, and it produces an artifact serving the same role as an entry in that stage's `produces[]`. **Partial** means the activity overlaps but no local artifact fills a `produces[]` role, or a local artifact fills one entry out of several. **Unmatched** means neither holds. Name similarity alone never counts.

### v2 → local (33 stages at `v2` HEAD, 2026-08-23)

| # | Stage | `produces[]` (abridged) | Verdict | Local counterpart |
| - | ----- | ----------------------- | ------- | ----------------- |
| 0.1 | workspace-scaffold | — | Unmatched | — |
| 0.2 | workspace-detection | — | Unmatched | — |
| 0.3 | state-init | — | Unmatched | `workflows/_lib/run-workflow.js` keeps per-run state, but that is harness plumbing, not a user-facing stage |
| 1.1 | intent-capture | intent-statement, stakeholder-map | Partial | `/outcome` writes `.claude/OUTCOME.md`; its Outcome state fills the intent-statement role, no stakeholder-map exists |
| 1.2 | market-research | competitive-analysis, build-vs-buy | Unmatched | — |
| 1.3 | feasibility | feasibility-assessment, constraint-register, raid-log | Partial | `/challenge` returns GO / NO-GO on a proposal; OUTCOME.md § Constraints fills the constraint-register role. No RAID log |
| 1.4 | scope-definition | scope-document, intent-backlog | Partial | OUTCOME.md § Non-goals is the scope-document role; `/slice` produces an issue backlog, but from a plan, not from an intent |
| 1.5 | team-formation | team-assessment, skill-matrix, mob-composition | Unmatched | — |
| 1.6 | rough-mockups | wireframes, user-flow | Unmatched | — |
| 1.7 | approval-handoff | initiative-brief, decision-log | Partial | `/issue` produces the handoff artifact; `/dr` produces the decision-log role. Neither is gated on the other |
| 2.1 | reverse-engineering | architecture, code-structure, component-inventory, … (9) | Partial | `/research` produces a sourced findings report and `/census` an undocumented-decision inventory; neither produces the 9-artifact code knowledge base |
| 2.2 | practices-discovery | team-practices, discovered-rules, evidence | **Matched** | `/scribe` extracts recurring patterns from closed PRs/issues plus `.claude/workspace/research/`, verifies them against current code, and proposes them to `docs/wiki/` |
| 2.3 | requirements-analysis | requirements | Unmatched | No local artifact class holds requirements |
| 2.4 | user-stories | stories, personas, traceability | Unmatched | — |
| 2.5 | refined-mockups | mockups, interaction-spec, accessibility-checklist | Unmatched | `agents/reviewers/reviewer-accessibility.md` reviews built UI; it produces no design artifact |
| 2.6 | domain-design | components, decisions, traceability | Partial | `/dr` fills the `decisions` role in MADR v4. No component model |
| 2.7 | units-generation | unit-of-work, unit-of-work-dependency, story-map | **Matched** | `/slice` breaks a plan into vertical-slice issues published in dependency order |
| 2.8 | contract-design | contract-summary | Unmatched | — |
| 2.9 | delivery-planning | bolt-plan, team-allocation, risk-and-sequencing-rationale | Partial | `/think` produces a structured plan with units; no allocation or sequencing-rationale artifact |
| 3.1 | functional-design | entities, rules, functional-spec, traceability | Partial | `/think`'s plan is design-level but is not a functional spec, and it lives in an issue's `## Plan` section |
| 3.2 | nfr-requirements | performance / security / scalability / reliability / observability requirements | Unmatched | Reviewer agents inspect these concerns after code exists; no requirements artifact |
| 3.3 | nfr-design | the same five as design documents | Unmatched | — |
| 3.4 | infrastructure-design | infrastructure-specification, monitoring-design, cicd-pipeline | Unmatched | — |
| 3.5 | code-generation | code-generation-plan, unit-test-instructions, code-summary | **Matched** | `workflows/code.js` implements per unit under Red → Green enforcement; `workflows/build.js` § Code nests it |
| 3.6 | build-and-test | build-instructions, integration/performance/security test instructions, build-test-results | **Matched** | `workflows/code.js` § Verify and `workflows/build.js` § Verify; `workflows/shake.js` and `workflows/assert.js` extend the same band |
| 3.7 | ci-pipeline | ci-config, quality-gates | Unmatched | The repository has CI, but no workflow or skill generates CI config |
| 4.1 | deployment-pipeline | cd-config, deployment-strategy, rollback-runbook | Unmatched | — |
| 4.2 | environment-provisioning | environment-inventory, validation-report | Unmatched | — |
| 4.3 | deployment-execution | deployment-log, smoke-test-results, health-check-report | Unmatched | — |
| 4.4 | observability-setup | dashboards, alarms, slo-config, tracing-config | Unmatched | — |
| 4.5 | incident-response | runbooks, incident-plan, escalation-matrix | Unmatched | — |
| 4.6 | performance-validation | load-test-plan, nfr-validation-matrix | Unmatched | — |
| 4.7 | feedback-optimization | slo-report, cost-analysis, drift-report | Unmatched | `workflows/adrift.js` produces a drift report, but of DR-versus-code decay, not of deployed-system drift |

Totals: 4 matched, 8 partial, 21 unmatched.

### local → v2 (7 workflows + 16 lifecycle skills)

| Local unit | Verdict | v2 counterpart |
| ---------- | ------- | -------------- |
| `workflows/build.js` | **Matched** | Construction-phase run (3.5 + 3.6) under the conductor. Its Branch / Ship half has no v2 stage |
| `workflows/code.js` | **Matched** | 3.5 code-generation (`for_each` unit) |
| `workflows/audit.js` | Partial | `stage-protocol-reviewer.md` §12a and `review_class: adversarial` give a per-stage two-party critique, not a diff-wide reviewer fan-out |
| `workflows/assert.js` | Partial | Same reviewer protocol plus the stage-completion artifact guard; v2 has no independent merge-readiness verdict |
| `workflows/adrift.js` | Unmatched | v2's `traceability` sensor is forward coverage, not decay detection against recorded decisions |
| `workflows/polish.js` | Unmatched | — |
| `workflows/shake.js` | Unmatched | — |
| `/scribe` | **Matched** | 2.2 practices-discovery |
| `/slice` | **Matched** | 2.7 units-generation |
| `/census` | Partial | 2.2 practices-discovery discovers rules from a repository; census discovers undocumented decisions |
| `/challenge` | Partial | 1.3 feasibility |
| `/dr` | Partial | 2.6 domain-design § decisions |
| `/fix` | Partial | v2 has a `bugfix` **scope** (a stage-membership filter), not a bugfix stage |
| `/issue` | Partial | 1.7 approval-handoff |
| `/outcome` | Partial | 1.1 intent-capture |
| `/research` | Partial | 2.1 reverse-engineering, 1.2 market-research |
| `/think` | Partial | 2.9 delivery-planning, 3.1 functional-design |
| `/checkout` | Unmatched | — |
| `/commit` | Unmatched | — |
| `/pr` | Unmatched | — |
| `/preview` | Unmatched | — |
| `/qualify` | Unmatched | — |
| `/transcribe` | Unmatched | — |

Totals: 4 matched, 10 partial, 9 unmatched of 23. The 11 `use-*` skills are excluded as context loaders.

### Inventory and environment

| Type | Item | Note |
| ---- | ---- | ---- |
| File | `/Users/thkt/.claude/workflows/*.js` | 7: adrift, assert, audit, build, code, polish, shake |
| File | `/Users/thkt/.claude/skills/*/SKILL.md` | 27: 16 lifecycle + 11 `use-*` loaders |
| File | `/Users/thkt/.claude/agents/` | 30 agent files, of which 18 reviewers and 3 critics |
| Tech | `core/aidlc-common/stages/<phase>/<slug>.md` on branch `v2` | Authoritative stage definitions, 33 files |
| Tech | `dist/{claude,codex,copilot}/…/tools/data/stage-graph.json` on branch `v2` | Compiled corroboration, 33 entries each. The three copies agree on every stage; only the sensor-file path prefix differs per harness dir |
| Config | v2 `scopes` field | 11 scopes (enterprise, feature, mvp, poc, bugfix, refactor, infra, security-patch, classic, workshop, express) select which stages execute. The local harness has no scope concept |
| Env | `gh` CLI authenticated, `scout` at `/opt/homebrew/bin/scout` | Both used for primary-source reads |

## Constraints

| Category | Constraint |
| -------- | ---------- |
| OUTCOME | `.claude/OUTCOME.md` § Non-goals excludes distribution and Claude Code re-implementation. A stage-coverage comparison is reference material for scope judgment, not a mandate to add stages |
| OUTCOME | `.claude/OUTCOME.md` § Constraints binds the harness to Claude Code's hook / skill / plugin surface. v2's engine (`aidlc-orchestrate.ts`, `aidlc-state.ts`, a compiled stage graph) sits outside that surface, so v2 stages are not portable as stages |
| Issue | #344 § Scope declares "v2 時点のスナップショットとしての対応表" in scope and "他フレームワークとの比較。採用提案" out of scope |
| Discovered | The upstream `v2` branch moved 4 times between the issue's date and today within the stages directory alone. Any table must pin a commit sha or it decays silently |

## Disconfirmation Check

The load-bearing absence claim is "all 7 OPERATION stages are unmatched". Sweeping for absence:

```
$ for t in deploy observab incident rollback provision "performance" "market research" mockup "user stor" "domain model" "NFR" "infrastructure" "CI pipeline" "feedback"; do n=$(grep -rli -- "$t" workflows/ skills/ 2>/dev/null | grep -v '/tests/' | wc -l | tr -d ' '); echo "$t -> $n files"; done
deploy -> 4 files
observab -> 7 files
incident -> 2 files
rollback -> 3 files
provision -> 1 files
performance -> 7 files
market research -> 0 files
mockup -> 0 files
user stor -> 1 files
domain model -> 0 files
NFR -> 4 files
infrastructure -> 4 files
CI pipeline -> 0 files
feedback -> 2 files
```

Every non-zero hit was then inspected, not a sample of them. The five OPERATION terms match 19 files and 20 lines outside `tests/`; all 20 are listed here, truncated at 160 characters by `sed`:

```
$ grep -rniE "deploy|observab|incident|rollback|provision" workflows/ skills/ 2>/dev/null | grep -v '/tests/' | sed 's/\(.\{160\}\).*/\1…/'
workflows/build.js:322:        "One-line description of the done state (implementation-independent, observable)",
workflows/_lib/run-workflow.js:223:  // lets a script log through a run where nothing it wrote is observable.
skills/research/SKILL.md:75:3. Triage each finding. A Next Action goes only to a finding tied to a direct answer to the `$ARGUMENTS` question, to advancing or p…
skills/research/SKILL.md:99:| Triage            | Phase 7 | Every Next Action states its linkage (question / OUTCOME / incident) or reads `record only`         …
skills/research/references/verification.md:36:2. If the commit message or a file header carries a generation marker such as `auto-generated from X` or a templat…
skills/research/references/domain-scope.md:11:| Infrastructure | `terraform/`, `infra/`, `ci/`, `.github/`, `deploy/`, `docker/` | pipeline, deploy, provision  …
skills/research/templates/research.md:26:<!-- Phase 4 findings, integrated, source-checked, and triaged in Phase 7. All findings, most important first. Sources …
skills/use-context-reviewer-security/references/cloud-operations.md:30:  deploy:
skills/use-context-reviewer-security/references/cloud-operations.md:38:          role-to-assume: arn:aws:iam::123456789:role/deploy
skills/qualify/SKILL.md:48:| Verifiable criteria         | Each item states an observable result an outside observer can judge                                  …
skills/use-context-root-cause-analysis/references/hypothesis-examples.md:3:State the problem so it is specific and observable. "The dashboard takes 5 seconds to…
skills/think/templates/plan.md:12:Outcome: {one line describing the done state; implementation-independent, observable}
skills/think/templates/plan.md:67:| Outcome       | Search results render within 1 second                | Make search fast (not observable)       |
skills/dr/SKILL.md:44:| technology-selection | Library, framework choices | Migration Strategy, Rollback Plan, Success Criteria                           |
skills/dr/SKILL.md:47:| deprecation          | Retiring technology        | Deprecation Target, Migration Plan, Deprecation Warning Period, Rollback Plan |
skills/outcome/templates/outcome.md:18:{Subject (human user / AI agent / system) holds the named state in the done condition. Implementation-independent. Observ…
skills/pr/references/prose-review.md:13:| Risk surfaced  | Are migration, rollback, or performance risks called out explicitly?                           |
skills/pr/templates/pr.md:20:- {Migration, rollback, or performance risk. Omit this line when there is none}
skills/use-workflow-tdd-cycle/references/writing-tests.md:35:| Assert mock was called      | Tests mock behavior, not component behavior | Assert on observable …
skills/use-context-reviewer-readability/references/comments-clarity.md:20:| Workarounds         | `// TODO(Q2 2025): Remove when API v2 deployed`   |
```

The 20 lines fall into five incidental kinds: the adjective "observable" (9 lines), the word "incident" inside this very skill's triage rule (2), a PR or DR template prompting the author to name a rollback risk (5), the research skill's Infrastructure domain-scope row naming directories to *search* (1), and a YAML or comment sample (3). None is a deployment, observability, incident, or provisioning capability.

Reading the zero-results: the four terms returning 0 (`market research`, `mockup`, `domain model`, `CI pipeline`) ran inside the same loop, in the same shell, against the same two roots as ten terms that returned non-zero. The query shape is therefore measured, not assumed, and the zeros separate absence from a mis-shaped query. They corroborate the same absence in the IDEATION and CONSTRUCTION phases.

Cross-method exhaustiveness check on the v2 stage count, three ways. The git tree listing (`gh api .../git/trees/v2?recursive=1` filtered to `core/aidlc-common/stages/`) yields 33 files. The compiled `stage-graph.json` in the `claude` dist yields 33 entries. The `codex` and `copilot` dist copies yield 33 entries with an identical `(number, slug, phase)` sequence; their 162 differing lines are all `sensors_applicable[].path` harness-directory prefixes (`.claude/sensors/` versus `.codex/sensors/` versus `.aidlc/sensors/`). On the local side, `ls skills/*/SKILL.md` yields 27 while `ls -d skills/*/` yields 29; the gap resolves to `skills/_lib/` and `skills/xlsx/` (the latter containing only `.DS_Store`).

## References

| Path | Description |
| ---- | ----------- |
| `https://github.com/awslabs/aidlc-workflows/tree/v2` | Primary source branch for AI-DLC 2.0 |
| `core/aidlc-common/protocols/stage-definition.md` (branch `v2`) | Authoritative stage-frontmatter contract; enumerates the 5 phases and the compile relationship to `stage-graph.json` |
| `core/aidlc-common/stages/<phase>/<slug>.md` (branch `v2`) | The 33 stage definitions |
| `core/aidlc-common/conductor.md` (branch `v2`) | Stage execution modes, approval gates, and the intra-stage Keep / Modify / Redo loop |
| `assets/AI-DLC-Workflows-2.0-Specification.pdf` (branch `v2`) | The 2.0 specification. Not read in this run; the stage list was taken from the machine-readable source instead |
| `aidlc-rules/aws-aidlc-rules/core-workflow.md` (branch `main`) | AI-DLC 1.x, 3 phases / 14 stages. Cited to show what a `main`-branch measurement would have produced |
| `gh issue view 344` | The issue whose three numeric claims this report re-derives |
| `.claude/workspace/research/2026-07-13-effort-policy-per-stage.md` | Prior-research candidate, shared=1 (the word "stage" alone). Not carried forward |
| `.claude/workspace/research/2026-08-22-workflows-record-script-history-shared.md` | Prior-research candidate, shared=1 (the word "workflows" alone). Not carried forward |

## Coverage Notes

- The 2.0 specification PDF was not read. The stage list came from the YAML sources that `stage-definition.md:8` declares authoritative, which outranks the PDF for this question; a PDF read would only be needed if the docs write-up quotes 2.0's own prose framing of the phases.
- The `v2` branch's `README.md` and `CLAUDE.md` were not read. `stage-definition.md:50,81` already states the 5-phase set as a schema constraint, which is stronger than a README restatement.
- Unknown: whether the `partial` verdicts would survive a reader other than this run. The rule is stated and each partial row names what is missing, so a disagreement is relocatable to a specific row rather than to the total.
- Unknown, requires a re-run: the table decays as `v2` moves. Closing it means pinning a commit sha in the docs write-up and re-running the tree count on review.
- Tool disagreement: none. The git tree listing and the three compiled `stage-graph.json` copies agree at 33; `ls` and the SKILL.md glob agree once `_lib` and the empty `xlsx` directory are accounted for.
- `references/verification.md` was read. Cross-method verification applies to the two exhaustiveness claims (33 stages, 7 local workflows) and was run three ways and two ways respectively. Primary-source verification applies to every v2 claim; all were taken from `gh api` reads of the `v2` branch rather than from a README or from memory, and the one unread source (the 2.0 specification PDF) carries no finding. The zero-result procedure was applied to the four zero-hit sweep terms.
- Advisor: invoked before the mapping was built. It flagged a silent data loss in the first stage-graph dump (keys `id`/`agent` do not exist; the real keys are `slug`/`number`/`lead_agent`), demanded the matching rule be fixed and stated before matching rather than after, required the 5-phase framing be confirmed from the spec rather than from a generated file's field, required the 27 skills be segmented before the reverse count, and required the OPERATION absence be searched rather than asserted. All five were applied. A second pass after the draft caught three defects, all corrected here: the Disconfirmation blocks had been reconstructed rather than pasted, the `v2.x` tag finding was inverted (`aidlc-rules/` does not exist on `v2` at all, so the tags are the v2 train's own), and the asymmetry row's supporting clause contradicted `build.js` and `code.js`, which do name predecessors in prose.

## Next Steps

| Intent | Next Command |
| ------ | ------------ |
| Understanding only | complete |
