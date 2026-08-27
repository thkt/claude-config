# Research: pr-skill-build-body-duplication

Generated: 2026-08-19
Session: 58285f75-fa5b-4363-bc8e-4868aebf7389
Intent: Feature planning
Domain: General
Prior research: none found

## Purpose

Investigate `/pr`'s current design and the PR-body knowledge it shares with `workflows/build.js`, in order to give issue #387 a `## Plan` that survives the headless build path.

## Key Findings

| Priority | Finding | Source | Next Action |
| -------- | ------- | ------- | ----------- |
| High | #387's central invariant is not enforceable from the workflow. The `&&` chain holds because `pr-body.py`'s exit code gates `gh pr create` in the shell, so build.js needs no view into the agent. A `stopped: "ship-failed"` can only fire on self-reported failure; a ship agent that skipped the skill and wrote the body from memory returns a schema-valid `{committed, pr_url, notes, unstaged}` carrying a real URL. | `workflows/build.js:1152-1155` (the `&&` chain), `workflows/build/pr-body.py:288-300` (exit 1 on malformed payload), `workflows/build.js:1111-1125` (SHIP_SCHEMA has no field naming the body's provenance) | Protects OUTCOME.md Behavior 1 (an AI agent cannot bypass a harness gate at its discretion). Hand to `/think`: the plan must keep the shared rule enforceable by a process exit code, not by an instruction the agent may skip. |
| High | Only 1 of the 5 sections #387 moves is the same knowledge. Template priority matches verbatim. Title Rules conflict, Design Decisions read different inputs, Language has a 4th site in Python, and Analysis Sources has no build-side counterpart. | See the § Duplication inventory rows below | Answers question 2. Hand to `/think`: scope the extraction to template priority, and decide each remaining row as a behavior change rather than a move. |
| High | #387 AC 2 is unimplementable as written for Title Rules, because the two sides hold opposite rules and the issue does not say which behavior changes. `/pr` strips a `feat:` / `fix:` prefix; build tells the agent to use its Conventional Commits commit subject, which carries one. | `skills/pr/SKILL.md:66` vs `workflows/build.js:1153` | Answers question 2. Hand to `/think`: pick the surviving rule and state it as a behavior change in the plan. |
| High | The Skill tool has no output schema, so #387's stated reason for preferring a skill over a shared md file does not hold. The tool contract takes only `skill` and `args`, and an inline skill loads its instructions into the caller's turn. `agent()` in build.js does take a `schema`. | Skill tool contract in this session's system prompt (primary source, running harness); `workflows/build.js:1161` (`schema: SHIP_SCHEMA`) | Answers question 4. Hand to `/think`: the choice between skill and md file rests on `${CLAUDE_SKILL_DIR}` expansion and discovery, not on input/output enforcement. |
| High | `/pr` never passes the base branch it selected. Step 2 asks the user to choose it, the preview displays it, and the diff commands use it, but the `gh pr create` at step 11 carries no `--base`. A user who picks `develop` while `origin/HEAD` is `main` gets a PR opened against `main`. | `skills/pr/SKILL.md:25` (select), `:41-43` (diff), `:97` (preview), `:34` (create, no `--base`); identical at `.ja/skills/pr/SKILL.md:25,34,41-43,97` | Direct answer to question 1. File as its own bug; it is independent of #387 and fixable in one line on both language sides. |
| High | `ship` is the only one of build.js's 13 `agent()` results dereferenced without a guard. A null return throws at `ship.pr_url` instead of producing a `stopped` value, so #387 AC 5 needs this fixed before a `ship-failed` path can exist. | `workflows/build.js:1137` (call), `:1194-1199` (deref). All 13 call sites are `:116, 371, 507, 527, 551, 609, 727, 845, 861, 881, 899, 1043, 1137`; the guards for the other 12 sit at `:130, 390, 592, 564+570, 567, 627, 740, 939, 950, 967+973, 968+974, 1065` | Answers question 4. Hand to `/think` as a precondition unit of #387 AC 5. |
| Medium | The precedent #387 cites is the wrong shape. `use-workflow-pageshot` is invoked from `/pr`, which runs in the main context. The only subagent-to-skill call in the repo is Cleanup's, and it targets `simplify`, a built-in absent from `skills/`. | `skills/pr/SKILL.md:86` (pageshot call), `workflows/build.js:729` (Cleanup), `ls skills/` shows no `simplify`. That `/pr` runs in the main context is inferred from `skills/pr/SKILL.md:1-8` (no `context:` field) plus `rules/conventions/SKILLS.md:45` (fork = sub-agent, inline = main), which states no default | Answers question 3. Hand to `/think`: the reliability of a repo-local skill reached from a headless subagent has no precedent here and needs a measurement, not an assumption. |
| Medium | The one existing subagent-to-skill call is treated as degradable on both ends. Its prompt hedges the invocation, and a total failure falls to a default rather than stopping the run. Ship would be the first fail-closed use of that mechanism. | `workflows/build.js:729` ("If it rejects a no-arg invocation, pass the diff scope"), `:740` (`|| { edits: [], tests_pass: false, stashed: false }`) | Answers question 4. Hand to `/think` as evidence that the invocation is a drop-out point, corroborating the lead finding. |
| Medium | Test coverage is asymmetric across the two halves of the PR body. The deterministic fact tail carries 42 tests; the LLM-written half carries one static string-order assertion. The build-side tests assert on the ship agent's prompt string, never on the body it produced. | `workflows/build/tests/pr_body_test.py` (42 `def test_` lines), `skills/pr/tests/template-priority.test.js:30-44`, `workflows/build/tests/build.behavior.test.js:1036-1039,1119-1122` (prompt assertions) | Answers question 2. Hand to `/think`: whatever replaces the static match must test the produced body, or the coverage gap survives the refactor. |
| Medium | The test's stated reason for the duplication is false. Its opening says the ship agent cannot read SKILL.md, but the ship agent is `agentType: "general-purpose"`, which carries every tool, and Cleanup already drives a skill from that same agent type. | `skills/pr/tests/template-priority.test.js:1-4` vs `workflows/build.js:1160` (`agentType: "general-purpose"`) and `:729` | Answers question 2 and confirms #387's premise. Hand to `/think`: the comment must be rewritten or deleted with the test. |
| Medium | #387's Alternatives table holds 4 options and none of them keeps the invariant where it already sits. `pr-body.py` is already a bundled process the ship agent runs, already exit-code-gated, and already reads `settings.json` for itself. | Issue #387 body, Alternatives considered; `workflows/build/pr-body.py:100-108,288-300` | Answers question 4. Hand to `/think`, which owns the design; do not settle it here. |
| Medium | `user-invocable: false` does not hide a skill from the Skill tool, so a new `use-workflow-pr-body` adds a visible entry for every agent in every session. DR-0049 counted exactly that noise as a reason to consolidate. | `docs/decisions/0049-consolidate-skill-to-skill-wrapper-pairs.md:24` | Answers question 3. Record the cost in the #387 plan; it does not block, because DR-0049's bar is caller count and #387 has 2 callers. |
| Medium | #387 is the re-split DR-0049 anticipated, so it does not violate that decision. DR-0049 consolidated on measured caller=1 and listed "再分離コスト" as the accepted cost of a 2nd caller appearing. | `docs/decisions/0049-...:16-22,48,72`; Reassessment Triggers at `:105-108` are unmet | Answers question 4. Record in the #387 plan as the DR check BOUNDARIES.md § Overeagerness requires. |
| Low | DR-0048 has fully decayed. It is `status: accepted` and unsuperseded, and mandates `## Agent` and `## Verification` sections for the generator skills, yet none of `pr`, `commit`, `issue`, `checkout` carries either. | `docs/decisions/0048-standardize-generator-skill-structure.md:2,54,57`; `grep '^## '` over the 4 SKILL.md files returns neither heading | Linked to #387 restructuring `/pr` without reconciling the DR that governs it. Raise as a separate DR-supersede task; do not fold it into #387. |
| Low | `language` resolution lives at 4 sites, and the 4th is Python a skill cannot serve. `pr-body.py` reads `settings.json` itself because build.js's payload omits a `language` key. | `skills/pr/SKILL.md:18`, `workflows/build.js:1045`, `:1144`, `workflows/build/pr-body.py:100-108`; `:1091-1109` omits `language` | Answers question 2. Hand to `/think`: extraction leaves the Python copy standing, so the Language row cannot reach a single source. |
| Low | #387's count of `stopped` values is right. The literal set is exactly 14 and a snapshot test pins it. | `workflows/build.js:43,61,67,132,354,390,399,417,426,581,594,632,654,696`; `workflows/build/tests/build.behavior.test.js:1315-1337` | record only |
| Low | The two `prose-review.md` files share a skeleton but no content, so they are similar code rather than duplicated knowledge. | `diff skills/issue/references/prose-review.md skills/pr/references/prose-review.md` shows every table row differing | record only |
| Low | A third PR-creating path exists outside #387's scope. `/scribe` runs its own `gh pr create` with a fixed `[scribe]` title convention and does not touch the bundled template. | `skills/scribe/SKILL.md:75` | record only |
| Low | Both sides ship in one plugin version, so a coordinated split cannot skew. The installed plugin carries `skills/pr/` and `workflows/build.js` together. | `plugins/cache/dotclaude/build/4.1.0/` holds both `skills/pr` and `workflows/build.js` | record only |

## Duplication inventory

The build side of each row is the ship agent's prompt, which is the only place build.js states a PR-body rule.

| Section | `/pr` | build | Same knowledge? |
| ------- | ----- | ----- | --------------- |
| Template priority | `skills/pr/SKILL.md:71` | `workflows/build.js:1145` | Yes. The 4 paths and their order match verbatim |
| Title Rules | `skills/pr/SKILL.md:62-66` strips `feat:` / `fix:` | `workflows/build.js:1153` takes the Conventional Commits commit subject | No. The rules are opposite |
| Design Decisions | `skills/pr/SKILL.md:75-82` detects 4 signals from diff and log | `workflows/build.js:1150` fills from `plan.decisions` plus the diff | No. Build reads a structured source `/pr` does not have |
| Language | `skills/pr/SKILL.md:18` | `workflows/build.js:1144`, and again at `:1045`, and again at `pr-body.py:100-108` | Partly. 4 sites, one of them Python |
| Analysis Sources | `skills/pr/SKILL.md:39-43` uses `<base>...HEAD` | No counterpart. Build derives its diff at Verify from `diffBase`, the branch point (`workflows/build.js:848,885,908`) | No. Different comparison point |
| Section set | `skills/pr/templates/pr.md:9-43` carries Related, Scope, Preview URL | `workflows/build.js:1149` orders the ship agent to skip Related / Closes and Scope / Backlog | No. Build overrides the shared template |
| Draft and base flags | `skills/pr/SKILL.md:34` passes neither `--draft` nor `--base` | `workflows/build.js:1153` passes `--draft` and conditionally `--base` | No. Deliberate divergence, plus the `/pr` base defect above |

## Available Data

| Type | Item | Note |
| ---- | ---- | ---- |
| File | `skills/pr/SKILL.md` | 97 lines, against the 100-line cap in `rules/conventions/SKILLS.md:74`. Extraction relieves that pressure |
| File | `skills/pr/templates/pr.md` | 55 lines. The only asset both paths read |
| File | `skills/pr/references/prose-review.md` | 21 lines. Read inline at step 7; the build path never reads it |
| File | `skills/pr/tests/template-priority.test.js` | 73 lines, 3 tests. Asserts path-order across 4 files, 3 headings plus `Closes #` in the template, and that the path build.js names exists. Asserts nothing about title, language, or design decisions |
| File | `workflows/build/pr-body.py` | 304 lines. Deterministic tail renderer, fail-closed on a missing `tests_pass` / `gates_pass` |
| Config | ship agent spawn | `workflows/build.js:1157-1163`: `label: "ship"`, `agentType: "general-purpose"`, `model: "sonnet"`, `schema: SHIP_SCHEMA` |
| Convention | `rules/conventions/WORKFLOWS.md:64-66` | A workflow script is one function body with no `import` and no dynamic `import()`. Sharing logic as a JS module is unavailable, which is why the shared knowledge has to be a file, a skill, or a process |

## Constraints

| Category | Constraint |
| -------- | ---------- |
| OUTCOME | Quality assurance moves from LLM discretion to deterministic layers; an AI agent must not be able to bypass a harness gate at its discretion |
| OUTCOME | Stay inside the Claude Code hook / skill / plugin spec. No fork, no patch |
| Mirror | `.ja/` is canonical and the English side mirrors in the same commit (ADR-0073) |
| Discovered | A workflow script cannot import a module (`rules/conventions/WORKFLOWS.md:66`) |
| Discovered | A SKILL.md body caps at 100 lines (`rules/conventions/SKILLS.md:74`); `skills/pr/SKILL.md` sits at 97 |
| Discovered | Skills are discovered flat under `skills/`; a subdirectory is not registered (`docs`, and `projects/-Users-thkt--claude/memory/reference_skill-discovery-spec.md`) |
| Discovered | The Skill tool accepts `skill` and `args` only, and returns no schema-validated value |

## Disconfirmation Check

Phase 5 did not run, so the duplication-inventory exhaustiveness claim is cross-checked by two methods.

Method 1, ugrep over `skills/` and `workflows/`:

```
$ ugrep -rn 'Design Decisions|Title Rules|Review focus|How to Test|Preview URL|pull_request_template|gh pr create' skills workflows
```

Non-`.ja` hits fell in exactly 6 files: `skills/use-workflow-pageshot/SKILL.md`, `skills/pr/SKILL.md`, `skills/pr/templates/pr.md`, `skills/pr/tests/template-priority.test.js`, `skills/scribe/SKILL.md:75`, `workflows/build.js` (lines 1004, 1145, 1147, 1150, 1153).

Method 2, bfs by filename:

```
$ bfs skills workflows -name '*pr*' -not -path '*/node_modules/*'
```

Returned `skills/pr`, `skills/preview`, `workflows/build/pr-body.py`, `workflows/build/tests/pr_body_test.py`, plus unrelated matches on the substring `pr` (`prompt-injection` fixtures, `find-prior-research.py`, `pre-check.py`, `code.preceding-units.test.js`).

The two methods agree on the PR-body rule sites. Method 2 additionally surfaced `skills/preview` (reviews PRs, does not create one) and `skills/scribe` (creates a fixed-format wiki PR), neither of which reads the bundled template. Method 1 did not name `pr-body.py` because that file holds no template or title rule, which its own read confirms. No zero-result was treated as absence; both queries returned non-zero.

## References

| Path | Description |
| ---- | ----------- |
| https://github.com/thkt/dotclaude/issues/387 | The proposal under investigation. Open, no `## Plan` |
| `docs/decisions/0049-consolidate-skill-to-skill-wrapper-pairs.md` | Caller-count bar for splitting a skill out; `user-invocable: false` visibility note |
| `docs/decisions/0048-standardize-generator-skill-structure.md` | Accepted, unsuperseded, and fully decayed against the 4 generator skills |
| `rules/conventions/WORKFLOWS.md` | Script evaluation form; degradation recording |
| `rules/conventions/SKILLS.md` | Frontmatter fields, size cap, reference notation |
| `projects/-Users-thkt--claude/memory/reference_skill-variable-expansion.md` | `${CLAUDE_SKILL_DIR}` expands at invocation time, not in a raw file read |
| `.claude/workspace/research/2026-07-28-build-ship-scope-deviation-root-cause.md` | Prior research, filename overlap 1. Below the carry-over bar; not inherited |
| `.claude/workspace/research/2026-07-13-issue-build-flow-simplification-impact.md` | Prior research, filename overlap 1. Below the carry-over bar; not inherited |
| `.claude/workspace/research/2026-06-06-research-skill-precision-postmortem.md` | Prior research, filename overlap 1. Below the carry-over bar; not inherited |
| `.claude/workspace/research/2026-05-02-confirmation-bias-skill-gaps.md` | Prior research, filename overlap 1. Below the carry-over bar; not inherited |

## Coverage Notes

- The reliability of a repo-local skill invoked from a headless subagent is unmeasured. Close it by running build against a throwaway issue with a probe skill that appends to a log file, then reading whether the log was written.
- Whether a given past PR came from `/pr` or from build cannot be told from `gh pr list` output. The mixed prefixes there corroborate the Title Rules conflict but do not prove it; the file:line pair is the evidence.
- The `explorer-feature` subagent spawned for Phase 4 did not return before synthesis. Every question put to it was answered independently from the sources cited above, so no finding rests on it.
- A `claude-code-guide` subagent was spawned to verify the Skill tool contract and did not return. The claim is instead sourced from the running harness's own tool contract, which is primary for this session.
- Cross-method verification: performed on the duplication-inventory exhaustiveness claim (see Disconfirmation Check). Both methods agreed.
- Primary-source verification: the Skill tool's parameters and inline-invocation semantics are taken from the running harness's tool contract rather than from web docs.
- `rules/conventions/SKILLS.md:45` states what `context` means but never names its default, so "no field means inline" rests on the harness's observed behavior rather than on a written rule. Close it by adding the default to that row after checking the official skills doc.
- Advisor: invoked twice. At Phase 6 it flagged the unverified guard quantifier on `ship`; the second pass caught that the first close had enumerated only the 6 assignment-form call sites. Both were closed by enumerating all 13 `agent()` sites and reading each guard before this report was finalized.

## Next Steps

| Intent | Next Command |
| ------ | ------------ |
| Feature planning | `/think` |
