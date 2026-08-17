---
name: research
description: Probe project and technical questions. Findings are positions to be challenged with explicit sources, not conclusions. Phase 6 advisor pass argues against the synthesis before it lands. Do NOT use for design planning or plan generation (use /think instead).
when_to_use: 調査して, 調べて, リサーチ, investigate, 分析して, issueやろう, issue見て, 横並びチェック, 類似パターン検出, refactor 横展開
allowed-tools: Bash(tree:*) Bash(git log:*) Bash(git diff:*) Bash(git show:*) Bash(wc:*) Bash(scout:*) Read LS Agent AskUserQuestion Bash(ugrep:*) Bash(bfs:*) Bash(codegraph:*) Bash(node:*) Bash($HOME/.claude/skills/research/scripts/*)
model: opus
context: fork
argument-hint: "[research subject or question]"
---

# /research - Project & Technical Investigation

Investigate the codebase and record findings with sources, without implementation.

## Input

The research subject is taken from `$ARGUMENTS`, a free-text topic or question. If empty, prompt via AskUserQuestion.

## Phase 1: Outcome Anchor

Read `.claude/OUTCOME.md`. If absent, generate the stub via /outcome. If the investigation steps into Non-goals, confirm with the user before proceeding.

## Phase 2: Prior Research Scan

Derive the lowercase hyphenated subject slug from `$ARGUMENTS` and run `${CLAUDE_SKILL_DIR}/scripts/find-prior-research.py <slug> .claude/workspace/research`. Parse the JSON `{ candidates: [{file, shared}, ...] }` (shared descending) from stdout.

- No candidates: note "No prior research found for `<slug>`" and move on
- A candidate with shared >= 2: carry forward per the table below
- A candidate with shared == 1: the filename overlap alone is too weak to trust as a match, so it is excluded from the carry-over table below and lands only in the report's References, with its path and shared count

| Extract                 | Carry to | Handling                           |
| ----------------------- | -------- | ---------------------------------- |
| Key Findings table      | Phase 7  | Re-verify or supersede as baseline |
| Constraints table       | Phase 4  | Use as input, do not re-discover   |
| Disconfirmation results | Phase 7  | Reference                          |

## Phase 3: Intent and Domain Clarification

Skip if `$ARGUMENTS` clearly indicates both. Otherwise ask via AskUserQuestion. Intent is chosen from Feature planning / Bug investigation / Understanding; Domain from the Domain column of the Phase 4 table, where General applies no scoping.

## Phase 4: Domain-Scoped Parallel Investigation

Launch Explore / ugrep / bfs / Read in parallel. Append each command and its raw output verbatim to the scratch. This is the audit trail; Phase 7 Disconfirmation quotes it directly and does not reconstruct.

### Source notation

State the source for each finding in place. Facts are `file:line` or command output, inferences `inferred from X`, unverified `unknown, requires X`. This is the source notation the later Phases and the report template refer to; no other form is accepted.

For Feature planning or Bug investigation intent, also invoke `Agent(subagent_type: explorer-feature)`. The spawn runs in the background, so keep the other searches going while its completion notification is pending. Take the result as a single JSON object `{ findings: [{ statement: string, source: string }] }`, and do not move to the next Phase before it arrives. When that trigger fires, or when a `.codegraph/` index exists, read ${CLAUDE_SKILL_DIR}/references/tactics.md and apply the tactics whose trigger matches. At the close, read ${CLAUDE_SKILL_DIR}/references/verification.md and apply the verification matching the finding's kind.

### Domain scoping

Scope by Domain per the table below. Pass the roots to Explore in its prompt, append the terms to ugrep / bfs, and start Read from the roots. If the target Domain's glob roots are all missing, fall back to General.

| Domain         | Glob roots                                                      | Domain-aligned terms            |
| -------------- | --------------------------------------------------------------- | ------------------------------- |
| Data model     | `schema/`, `models/`, `db/`, `drizzle/`, `prisma/`, `*.sql`     | model, migration, table, column |
| API            | `routes/`, `handlers/`, `controllers/`, `api/`, `server/`       | endpoint, route, handler        |
| Infrastructure | `terraform/`, `infra/`, `ci/`, `.github/`, `deploy/`, `docker/` | pipeline, deploy, provision     |
| General        | No scoping. Let Explore find                                    | none                            |

## Phase 5: Strong Inference (Bug investigation only)

Apply `~/.claude/rules/core/OPERATION.md § Debug Investigation Protocol` to eliminate the bug, then once the root cause is confirmed, run ${CLAUDE_SKILL_DIR}/references/verification.md § Same-origin sweep.

## Phase 6: Advisor Pre-Synthesis Check

Invoke `advisor()` with no parameters. Advisor sees the full conversation history. If it flags a missed area or weak inference, return to Phase 4 to narrow the scoping.

Skip the invocation only when all conditions hold, and record the skip reason in the output.

- Phase 2 hit prior research and the current run inherits only
- Intent is Understanding and Domain is General
- No claim crosses a repository boundary or drives PR scope

## Phase 7: Synthesis

1. If Phase 2 found prior research, integrate the inherited findings / constraints into Key Findings, marking each re-verified or superseded
2. Confirm each finding carries a source in the Phase 4 source notation. Mark gaps `unknown, requires X`
3. Triage each finding. Only a finding tied to a direct answer to the `$ARGUMENTS` question, to advancing or protecting an OUTCOME.md Behavior / Constraint, or to handling a real incident (issue / bug report) carries a Next Action, with the linkage stated in the action cell. Every other finding gets Next Action `record only`, and all findings stay listed
4. Record Disconfirmation. If Phase 5 ran, write `Covered by Phase 5 elimination`; if skipped, quote the command and raw output from the scratch verbatim. Treat 0 hits as possible tool misuse before absence
5. Confirm every Phase 3 question is answered or recorded as `unknown, requires X`

## Output

Generate the report following the skeleton in ${CLAUDE_SKILL_DIR}/templates/research.md, fill in `${CLAUDE_SESSION_ID}`, and save to `.claude/workspace/research/YYYY-MM-DD-<slug>.md`.

## Completion Criteria

Not done until all are satisfied. An item whose Condition carries "(...)" is required only when applicable.

| Item              | Condition                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| OUTCOME           | `.claude/OUTCOME.md` present (Phase 1)                                                               |
| Prior research    | `Prior research` field filled with the slug or `none found`                                          |
| Source            | Every finding has an explicit source or an `unknown, requires X` note                                |
| Triage            | Every Next Action states its linkage (question / OUTCOME / incident) or reads `record only`          |
| Audit trail       | Phase 4 scratch captured with commands and raw output verbatim                                       |
| Cross-method      | Cross-method verification performed for exhaustiveness claims (when such a claim exists)             |
| Primary source    | Primary-source verification run on load-bearing external claims, or marked unverified (when present) |
| Same-origin sweep | Sweep performed when Bug intent confirmed a root cause (when applicable)                             |
| advisor           | Phase 6 advisor invoked, or skip reason recorded                                                     |
| Save              | Output saved to `.claude/workspace/research/`                                                        |
