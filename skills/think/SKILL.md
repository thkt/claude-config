---
name: think
description: Design exploration with adversarial critique by critic-design. Assembles the surviving approach into a structured plan, self-checks it, and returns it to the caller. The issue's Plan section is the plan's only persistent home. Do NOT use for codebase investigation without planning intent (use /research instead).
when_to_use: 計画して, 設計して, アプローチ検討, 方針決め, planning, design exploration
allowed-tools: Read Write LS Agent AskUserQuestion Bash(${CLAUDE_SKILL_DIR}/../research/scripts/*) Bash(${CLAUDE_SKILL_DIR}/../scribe/scripts/*) Bash(ugrep:*) Bash(bfs:*) Bash(test:*) Bash(git cat-file:*) Bash(git show:*) Bash(git rev-parse:*)
model: opus
argument-hint: "[task description]"
---

# /think - Design Exploration

Subject 2+ approaches to `critic-design` critique, and let only the surviving approach reach the structured plan. Write the plan to a draft file following the templates/plan.md skeleton and also return it in conversation. Persistence happens when `/issue` transfers it into the issue's Plan section.

## Input

`$ARGUMENTS` carries the task description and research context. If empty, confirm with the user via AskUserQuestion. The first line is the task title.

## Phase 1: Establish the Why

Read `.claude/OUTCOME.md`. If it does not exist, generate it via `/outcome`. The Why is three things, plus a fourth when the task is a Bug: who needs this and with what pain, what counts as success, why now, and for a Bug what the root cause is. Attach evidence to the pain. Identify the root cause together with evidence such as reproduction steps or logs; when the cause is undetermined, do not proceed to design and route to `/research` instead. When the report that comes back carries a `Hypotheses Log` section, read it as the evidence for the cause. Design starts only once this Why is readable from $ARGUMENTS and the conversation. Do not proceed on placeholders; pin it down via AskUserQuestion.

## Phase 2: Design Exploration

Ground the approaches in the real code and existing research before making them. Steps 1 through 4 gather that grounding, and they finish with no approach yet in existence.

1. Read the relevant code. When the task, the issue, or a research report cites a mock image or screenshot, open that image file with Read as well. Absence from the text is not evidence the element does not exist
2. Derive a lowercase hyphenated slug from the task's words and run ${CLAUDE_SKILL_DIR}/../research/scripts/find-prior-research.py <slug> .claude/workspace/research. Read the matching report from the candidates on stdout, and take each of its parts per the table in ${CLAUDE_SKILL_DIR}/references/research-report-intake.md. With no candidate, proceed as though no research report exists
3. Search for an existing module whose set of screens or layers matches the one being planned, in any domain, as a reference_module candidate, and record the result as kind (module/no-module/new-shape) with a reason
4. Run `python3 ${CLAUDE_SKILL_DIR}/../scribe/scripts/find_wiki_rule.py docs/wiki <slug> <the paths likely touched>` and read the `matched` pages. A rule bears on how units are cut and which files they take, so reading it after the decomposition means cutting them again
5. Generate 2+ approaches from distinct perspectives (simplest thing that works / structure and extensibility / developer experience). Do not bundle independent technical decisions into one question; ask each separately with a recommendation and trade-offs
6. Launch `critic-design` on the approaches. Include the task title verbatim in the prompt, and have it return a single JSON object `{ verdict: "GO" | "NO-GO", weaknesses: string[], actionable: string[] }`
7. On NO-GO, resolve blockers inline before proceeding. Present the surviving design to the user with trade-off rationale, and wait for approval
8. After approval, ask whether the technical decision needs a DR

## Phase 3: Plan Generation

Decompose the approved design into units, independently implementable bundles of outcome, in implementation order, and serialize them into PLAN_SCHEMA-equivalent JSON `{ test_command, reference_module, units: [{ id, goal, contract, files: string[], tests: [{ id, name }], seam }] }`. Construct the decomposition tests-first, so unit size is decided mechanically from the test bundles. Enumerate acceptance-test candidates from the whole design, group them into bundles per unit of outcome, and assign each bundle the files it touches to form a unit. Keep each bundle within the non-seam unit caps, and split any bundle that exceeds them. An outcome with no verifiable behavior (docs / config) yields no acceptance-test candidates, so add it as a unit of its own.

1. Assign sequential ids in U-001 / T-001 format, with T-NNN unique across the whole plan
2. Where the target repo's tests carry prefixed ids, follow that convention and number as T-SK077, continuing from that prefix's repo-wide max. A plan that stays bare while the repo is prefixed leaves the rename to implementation time
3. On a bare repo, plan-wide uniqueness does not reach inside a single file. Skip the numbers already used in the file the tests land in
4. tests[].name is a one-line condition + expected-result statement. The code workflow uses it verbatim as the test name, and build matches it as a fixed string
5. A unit with no verifiable behavior (docs / config) gets an empty tests array. build advances that unit as a single direct-implementation step rather than Red-Green
6. Route acceptance-test candidates that test_command cannot execute (a visual check, manual coordination with an external service) out of T-NNN and into `### Manual verification`. Each routed criterion names the mechanism that takes it on (test-storybook, code review, and so on)
7. A unit that renders domain fields lists each rendered field as its own T-NNN entry, one field per line; bundling them into one entry hides a single field's omission
8. Once 2 or more units carry tests, place exactly one seam unit last and mark it `seam: true`. Every unit can be green while nothing has run the wiring that connects them. The seam unit's tests run the real modules across the unit boundary and assert that connection. Only I/O with external systems may be faked there. build's `validate()` rejects a plan with no seam unit
9. A non-seam unit's caps are 3 files and 4 tests. A seam unit's tests cross the unit boundary, so its file count legitimately grows and the caps do not apply to it. Split any unit over the caps along outcomes, and confirm the resulting new unit composition with the user. Candidates carved out of scope stay out of the plan and go to backlog candidates. `UNIT_CAPS` in `workflows/build.js` enforces these caps deterministically, seam exemption included. Change this description and `UNIT_CAPS` in the same commit
10. Once the units are settled, run `python3 ${CLAUDE_SKILL_DIR}/../scribe/scripts/find_wiki_rule.py docs/wiki <slug> <the units[].files>` and diff it against what Phase 2 read. Every page under `matched` is either cited or written off in the prose with the reason it does not bear on this plan. A page under `related` only shares a word, so state why it bears when citing one
11. Pass the self-check (missing required fields, duplicate ids, empty units / files / goal / contract) and the pre-writeout verification in ${CLAUDE_SKILL_DIR}/references/pre-write-check.md, then write the plan following the ${CLAUDE_SKILL_DIR}/templates/plan.md skeleton to `.claude/workspace/planning/YYYY-MM-DD-<slug>.plan.md`. The slug is the lowercase hyphenated title. Include both the `## Plan` and `## Backlog candidates` sections

### test_command

A test_command failure must be attributable to the planned scope alone. On a repository carrying pre-existing debt such as repo-wide type errors or format drift, scope the gate by paths: lint the touched directories and filter type-check output by path patterns, never by content grep. Both build's Revalidate and code's verify run from the repository root, so write a command that works from there.

### base

`base:` names the branch the plan will be implemented against (the PR base). Read it from the task description or the conversation; when nothing names one, write the current checkout's branch. build does not read this line, so pass the same value in build's `base` arg when handing the plan over.

### reference_module

A contract can cite a behavior at one call site only, which does not stop the surrounding structure from being hand-rolled. The candidate is already searched in Phase 2, so record its result here as `reference_module: { path, files, instances }` without searching again. Write the structure in the `reference_module` section, and every unit refers to it.

1. Make U-001 its structure replication (same directory layout, component names, export names; tests is an empty array) only when the skeleton fits under 4 files. Otherwise split units by layer and let each unit replicate its own slice
2. State the shared conventions to keep (which shared components it composes, where formatting lives, how state is passed). Deviating is allowed only with a stated reason in the plan
3. When several candidates match, pick the one whose screen set is closest and name the others in the prose
4. When none matches, write null and say in the prose why this shape is new. A null with no reason is a planning defect
5. When instances is 2 or more, say "Nth instance" in the prose, telling the implementer to replicate rather than design

### Preconditions

List existing dependencies only, each line repo-root-relative in one of two forms: path only, or path + stable anchor. An anchor is limited to a single exported / public symbol name that `ugrep -F` matches as a literal fixed string; never private implementation details, comment strings, or line numbers. When no stable symbol exists, write the line as path only. Files newly created by a unit are never listed.

### contract

Select, do not generate. Never sketch behavior in prose or invent new code fragments; a contract is a citation plus one intent line. Pick the citation in this priority order: an existing shape in the codebase (path + public symbol, under the same stable-anchor rules as Preconditions) > a docs/wiki page > a deep link into the pinned version's official docs; external libraries follow SOURCING.md. When the citation is a docs/wiki page, copy the matching 定型手順 line verbatim; where no step line fits and the 内容 sentence does, copy that instead. A page carries no public symbol, so it goes into `### Preconditions` as a path-only line. A rule bearing across units goes in `### Rules`, not in a contract. For a new shape with no citable source, do not invent a signature; leave the shape to implementation and let the acceptance tests pin the behavior. Cited paths + symbols also go into `### Preconditions`.

When a mock or design document carries UI wording verbatim (labels, placeholders, button text, option names), copy it into the contract as-is with the source path attached.

## Output

Return the following to the caller in conversation.

| Item               | Content                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| ready              | true when the plan passed the self-check and no undecided points remain              |
| plan               | The self-checked structured plan                                                     |
| plan file          | Path of the written `.plan.md`                                                       |
| blockers           | Causes of ready = false that need a user decision                                    |
| backlog candidates | Candidates carved out of scope. "none" if none                                       |
| design summary     | Adopted approach, compared approaches, the `critic-design` verdict, DR needed or not |
