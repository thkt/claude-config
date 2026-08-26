# Research: build-workflow-plan-scope-deviation

Generated: 2026-07-28
Session: session_01PpzJdDnqPq6478Gt3UKjfg
Intent: Bug investigation
Domain: General
Prior research: none found

Saved to the caller-specified scratchpad path instead of `.claude/workspace/research/2026-07-28-build-workflow-plan-scope-deviation.md`. Writing into `workspace/research/` would change what a future Phase 2 scan finds, so this run leaves that directory untouched.

## Purpose

Find why the build workflow's run for issue #259 landed commit 96aab143, which changed `rules/conventions/MARKDOWN.md` and `rules/conventions/PROSE.md` on both mirror sides although the plan's scope covered only `skills/research/`. Establish what the Code stage tells the implementation agent about file scope, what detects a scope deviation, and whether the same deviation shape occurred in earlier build runs.

## Key Findings

| Priority | Finding | Source | Next Action |
| -------- | ------- | ------ | ----------- |
| High | Root cause. The Ship stage prompt exempts every tracked-file modification from the plan-scope allow-list: "Modifications to tracked files may be staged as they are, but stage an untracked path ... only when it appears in the plan's files". The plan file list is passed to Ship only as the untracked allow-list, so any tracked file dirty at Ship time is swept into the commit no matter who changed it. | workflows/build.js:989; `.ja` canonical carries the same clause at .ja/workflows/build.js:955-957 | Answers the "原因" question and protects OUTCOME Behavior 1 (gates not bypassable at discretion). File an issue to give Ship a never-stage list |
| High | The Ship agent applied that clause knowingly, not by drift. Its result reads "these are the same paths flagged as scope_deviations in the fact-tail payload. Per the task instructions, tracked-file modifications may be staged as-is regardless of plan membership ... so I staged and committed them as commit 96aab143". | StructuredOutput at 2026-07-27T16:25:20.598Z in projects/-Users-thkt--claude/5321f4f4-0c57-404f-b0de-3fcf3143ad44/subagents/workflows/wf_4d8c347b-cdb/agent-acc6b755acab6c2e7.jsonl | Answers the "原因" question. The fix belongs in the prompt clause, not in agent judgment |
| High | Detection worked and did not gate. `scopeDeviations` (build.js:819) computed exactly the 4 conventions paths, and the run record stores them. The symbol appears at build.js:819 (compute), :856 (log), :958 (PR payload), :1017 (return) and in no conditional; Ship runs unconditionally at build.js:986. The conformance reviewer raised an independent `scope_creep` finding on the same 4 paths, also report-only. | `grep -rn scopeDeviations workflows/` returns only those 4 lines outside tests; run record `result.scope_deviations` = the 4 conventions paths; build.js:986 | Answers the "検出する仕組み" question and protects OUTCOME Behavior 1. Decide gate-or-report for scope deviations |
| High | Origin of the 4 changed files. A different, concurrently running session (fe725f12-cb2e-44b7-96ce-c115dfafb251) edited them in the same working tree between 16:00:15Z and 16:08:50Z, inside build's window (branch checkout 15:51:54Z, Ship commit 16:23:08Z). Build has no mechanism that notices a third party mutating its tree. | Cross-session scan of projects/-Users-thkt--claude/**/*.jsonl for Edit/Write on conventions/PROSE.md and conventions/MARKDOWN.md, 8 rows all attributed to fe725f12; timeline in the scratch | Answers the "原因" question. Any fix must treat a dirty tracked file of unknown authorship, not only build's own leftovers |
| High | The Code stage never states a file boundary. The implementation agent gets `Unit ${unit.id}'s goal is ... The target files are ${JSON.stringify(unit.files)}` as targets, and the only scope rule anywhere in code.js runs the opposite direction (forbidding implementing less than planned, code.js:219). `grep -n "outside\|out of scope\|out-of-scope\|do not touch\|scope" workflows/code.js` returns only lines 183 and 187, both about scope-cut. | workflows/code.js:213, :219; grep output quoted in the scratch | Answers the "code stage が実装 agent に渡す指示" question. Not the cause of this incident, but the same gap |
| High | Recurrence confirmed, same mechanism. Build run wf_9f013563-d9d (issue #213) produced commit a44ee6e1, whose own message enumerates the swept-in foreign work: "同一 working tree に以下の独立した変更も含まれる (#213 のスコープ外、PR 本文の scope deviations に記録)", listing build.js / code.js model changes, skills/scribe, hooks/lifecycle/context-monitor.sh, .gitignore. PR #210 (issue #187) carries the human corrective 7165a38e "refactor(workflows): scope 外の隣接変更を #211 へ分離", the same shape as 83adbe4a on this branch. | `git show --stat --format='%H%n%s%n---%n%b' a44ee6e1`; `git show --stat 7165a38e` | Answers the "過去の build 実行でも起きていたか" question. Evidence that this is systemic, not a one-off |
| High | Aggregate recurrence. Of 28 stored workflow runs carrying `scope_deviations`, 18 are non-empty, 9 empty, 1 the sentinel "diff listing unavailable; scope not verified". In this repository 5 of 5 runs with the field are non-empty. The 18 are not one defect: entries like `.claude/OUTCOME.md`, `.claude/agent-memory/`, `.codegraph/`, `daemon.lock` are untracked-path leakage past the baseline subtraction (build.js:812-813), a different failure from the tracked-file sweep at build.js:989. Only wf_9f013563-d9d was traced end to end as a tracked out-of-plan file reaching a build commit. | Deterministic scan of `result.scope_deviations` over projects/*/*/workflows/wf_*.json, raw counts in the scratch | Answers the "過去の build 実行でも起きていたか" question. Separate the two defects before fixing either |
| Medium | The Cleanup stage widened the blast radius. Its whole prompt targets "the current diff" with no file scope, so it edited `.ja/rules/conventions/MARKDOWN.md` at 16:15:00.941Z, six minutes after the concurrent session wrote it. That edit was not stashed (`tests_pass: true, stashed: false`), and the committed hunk carries it: the added line reads `` `/fix` のようなスラッシュコマンドは、素で書くと formatter が直前の空白を落として前の語と繋がるため、inline code で囲む。``, one sentence with the reason folded in, against the two-sentence form on the removed line. Build did not merely carry a foreign change through, it rewrote one. | workflows/build.js:620-633; Edit at 2026-07-27T16:15:00.941Z in wf_4d8c347b-cdb/agent-a8c080e5429568e7c.jsonl; `git show 96aab143 -- .ja/rules/conventions/MARKDOWN.md` run in this session, output in the scratch | Answers the "原因" question. Cleanup needs the same scope input as Ship |
| Medium | Chesterton's Fence on the exempting clause. DR-0088 lists "Ship の staging ガード (`git add -A` 禁止、pre-existing untracked の除外) をコミット地点が増えても維持する" as a driver, and Ship's own instruction names "the cleanup edits and anything the unit commits left behind" as what it must sweep. Cleanup edits are themselves tracked-file modifications, so narrowing the exemption to plan files alone would strand them uncommitted. | docs/decisions/0088-commit-each-unit-in-build-with-plan-anchors-as-trailers.md Decision Drivers; workflows/build.js:983 | Constrains the fix. A never-stage list beats an allow-list here |
| Medium | The one guard that could have covered this is structurally blind to it. `untracked_baseline` is built only from porcelain `??` lines, so a tracked file that a concurrent session modifies never enters it. It is also the only never-stage list code.js receives. | workflows/build.js:464-481; workflows/code.js:150-155 | Constrains the fix. The already-computed `scopeDeviations` is the available never-stage source |
| Medium | Trailer absence is a reliable discriminator for which stage authored a commit. code.js copies a verbatim `Unit:` / `Contract:` / `Tests:` / `Seam:` / `Issue:` block into every unit commit (code.js:128-139, :157), while Ship writes its message freely. 96aab143 carries no trailers; 3335013c and e1a96f7d carry the full block. | workflows/code.js:128-139, :157; `git log -1 --format=%B` on each commit, quoted in the scratch | record only |
| Medium | Both mirror sides carry the defect, so a fix is a two-file change in one commit per the MIRROR constraint. `.ja/workflows/build.js:955-957` is the canonical Japanese form of the same clause and `.ja/workflows/build.js:792/828/924/984` mirrors the same four non-gating uses. | .ja/workflows/build.js:955-957, :792, :828, :924, :984 | record only |
| Low | Incidental defect in this skill's own Phase 2. `${CLAUDE_SKILL_DIR}/scripts/find-prior-research.py <slug> ...` is written as a direct invocation but the file is not executable, so it exits 126. The `python3 ...` workaround that succeeds is outside the skill's `allowed-tools`, which lists `Bash($HOME/.claude/skills/research/scripts/*)` and `Bash(node:*)` and no `python3`. | Raw exit-126 output in the scratch; skills/research/SKILL.md:5, :26 | record only |
| Low | Second incidental defect. Phase 2 writes the search directory as the relative `.claude/workspace/research`, which is correct only when cwd is the repo root and resolves to a doubled `.claude` segment in this repository. An agent thread whose cwd resets would silently scan nothing and report "no prior research". | skills/research/SKILL.md:26; `ls /Users/thkt/.claude/.claude/workspace/research` | record only |
| Low | Third incidental gap, lower confidence. Phase 2 says "derive the lowercase hyphenated subject slug" with no rule for how many words or which ones, and the candidate set moves with that choice. The slug this run used returned zero candidates; a slug carrying `stage` (defensible, since the request names the "code stage") would have matched `2026-07-13-effort-policy-per-stage.md` at shared 1 on an unrelated word. That is the false-positive shape the branch name `fix/259-slug-overlap` suggests #259 exists to contain. | skills/research/SKILL.md:26; `ls .claude/workspace/research` word sets | record only |

## Available Data

| Type | Item | Note |
| ---- | ---- | ---- |
| File | workflows/build.js (+ .ja) | :819 scopeDeviations compute, :856 log, :958 payload, :986 unconditional Ship, :989 staging clause, :983 remainder framing, :620-633 Cleanup, :464-481 untracked baseline |
| File | workflows/code.js (+ .ja) | :128-139 trailer body, :150-155 per-unit staging and never-stage set, :213 target-files phrasing, :219 scope-cut rule |
| File | workflows/build/pr-body.py | :111, :163 render scope_deviations into a PR section ("Plan スコープ外の変更ファイル"). Reporting path only |
| Config | settings.json hooks | PreToolUse Bash hooks are auto-package-manager, npm-safe-install, rm-to-trash, textlint-lint. None inspects staging or commit scope |
| Env | Run record wf_4d8c347b-cdb.json | `result.scope_deviations` holds the 4 conventions paths. `args` carries no `base`, so the dirty-branch-point guard at build.js:489-504 was skipped |
| Config | docs/decisions/0088-...md | Records the staging guard as an untracked-leak guard, which is why tracked files were left exempt |

## Constraints

| Category | Constraint |
| -------- | ---------- |
| OUTCOME | Behavior 1 requires that an AI agent cannot bypass a harness quality gate at its discretion. A detected scope deviation that only prints is not a gate |
| OUTCOME | Constraint 2 makes `.ja/` canonical and requires the English mirror in the same commit, so any prompt-clause fix is a paired edit |
| Design | DR-0085 keeps heavy assurance (`/audit`, `/polish`) human-invoked on the draft PR, so build cannot answer this by adding a review stage |
| Design | DR-0088 requires Ship to sweep up the Cleanup edits, which are tracked modifications. The exemption cannot simply be deleted |
| Mechanism | `untracked_baseline` can only ever see `??` lines, so it cannot be extended to cover tracked files |

## Hypotheses Log (Bug investigation only)

| Hypothesis | Discriminating test | Result |
| ---------- | ------------------- | ------ |
| H1. A code.js implementation agent edited the conventions files because its prompt states no out-of-plan prohibition | Scan every session and subagent transcript for Edit/Write on conventions/PROSE.md and conventions/MARKDOWN.md, and check the unit commits' file lists | Eliminated as origin. No unit agent touched them; 3335013c and e1a96f7d contain only plan files. The prompt gap at code.js:213 is real but did not fire here |
| H2. The Cleanup (simplify) stage pulled the files in by working on the whole diff | Read the Cleanup prompt scope and the agent's first `git status` | Partly confirmed as amplifier, eliminated as origin. The 4 files were already modified when Cleanup started at 16:13:47Z; Cleanup then edited one of them at 16:15:00Z |
| H3. Verify failed to detect the deviation | Read `result.scope_deviations` in the run record and grep every use of `scopeDeviations` | Eliminated. Detection produced exactly the 4 paths. The defect is that all 4 uses are compute, log, payload, return, with no conditional |
| H4. The Ship stage sweeps tracked modifications regardless of plan membership | Read build.js:989 and the Ship agent's own reported reasoning | Confirmed as root cause. The clause exists verbatim and the agent cites it as its authorization |
| H5. The changes originated outside build, from a concurrent session sharing the working tree | Timestamp every conventions edit across all session transcripts and compare against build's stage boundaries | Confirmed as contributing cause. 8 edits by session fe725f12 at 16:00:15Z to 16:08:50Z, entirely inside build's window |

## Same-origin Sweep (Bug investigation, root cause confirmed only)

The root-cause clause entered at 93b8b950 (2026-07-22, "feat(workflows): seam unit 必須化と deferred scope-cut 検出を追加"). `workflows/build.js` itself was added at cf1f2024 (2026-07-02), so the sweep uses the clause-introducing commit, whose file set is the two mirror sides of build.js, build/pr-body.py, build/tests/build.behavior.test.js, code.js, and code/tests/code.model.test.js.

| Sibling | Consumer (spec source) | Result |
| ------- | ---------------------- | ------ |
| .ja/workflows/build.js | The workflow loader, mirrored per MIRROR.md | Same-kind defect. :955-957 carries the identical tracked-file exemption and :792/:828/:924/:984 the identical non-gating uses |
| workflows/build/pr-body.py | Ship's `&&` chain renders it into the PR body | Different-kind, no defect. It renders `scope_deviations` under "Plan スコープ外の変更ファイル" (:49, :62, :111, :163). It is the reporting sink, and it did report the 4 paths |
| workflows/build/tests/build.behavior.test.js | node test runner | Same-kind gap, and the sharpest statement of it. :698-699 asserts `scope_deviations が ship prompt (PR body payload) に載る`, so the test suite pins exactly the hand-off the root cause depends on: the list reaches Ship as PR-body text and as nothing else. Nothing asserts a never-stage hand-off, so a fix that adds one must extend this test rather than leave it untouched |
| workflows/code.js | build.js `sibling("code", ...)` | Pass with residual risk. :150-152 restricts staging to the unit's files plus "any other file you created or modified for this unit during this run", a positive restriction that held here (the unit commits stayed clean), but :153-155 still offers only `untracked_baseline` as the never-stage list |
| workflows/code/tests/code.model.test.js | node test runner | No defect. Scope is model and effort propagation, unrelated to staging |

## Disconfirmation Check

Covered by Phase 5 elimination.

## References

| Path | Description |
| ---- | ----------- |
| /Users/thkt/.claude/workflows/build.js | Root-cause file. Ship staging clause :989, remainder framing :983, scope deviation compute :819, Cleanup :620-633 |
| /Users/thkt/.claude/.ja/workflows/build.js | Canonical mirror side carrying the same clause at :955-957 |
| /Users/thkt/.claude/workflows/code.js | Code stage prompts and per-unit staging rules |
| /Users/thkt/.claude/docs/decisions/0088-commit-each-unit-in-build-with-plan-anchors-as-trailers.md | Why the staging guard covers untracked paths only |
| /Users/thkt/.claude/projects/-Users-thkt--claude/5321f4f4-0c57-404f-b0de-3fcf3143ad44/workflows/wf_4d8c347b-cdb.json | The #259 run record, holding the 4 detected deviations |
| /Users/thkt/.claude/projects/-Users-thkt--claude/fe725f12-cb2e-44b7-96ce-c115dfafb251.jsonl | The concurrent session that authored the conventions edits |
| /Users/thkt/.claude/projects/-Users-thkt--claude/8a7d83b3-f075-41cb-88ce-9025a5da4b29/workflows/wf_9f013563-d9d.json | The #213 run, the verified same-kind precedent behind commit a44ee6e1 |
| /private/tmp/claude/claude-501/-Users-thkt--claude/5321f4f4-0c57-404f-b0de-3fcf3143ad44/scratchpad/phase4-scratch.md | Phase 4 audit trail, commands and raw output verbatim |

Phase 2 found no prior research, so no prior-research file is listed here. The two files in `.claude/workspace/research/` (2026-07-13-effort-policy-per-stage.md, 2026-07-13-metacognition-systems-thinking-principles.md) share zero words with the slug and were not returned as shared-1 candidates either.

## Coverage Notes

- Advisor: the caller reported advisor unavailable, so the Phase 6 invocation did not run as written. The Phase 6 skip conditions do not hold (Phase 2 found no prior research and Intent is not Understanding), so this is a deviation, not a satisfied skip. In its place I asked once whether any area was missed, and it surfaced two unchecked areas that I then closed. First, whether a hook could have blocked the staging: `settings.json` PreToolUse Bash hooks are auto-package-manager, npm-safe-install, rm-to-trash, and textlint-lint, none of which inspects staging or scope, so no hook covers this. Second, whether the exempting clause is deliberate (Chesterton's Fence): DR-0088 shows it is, which turned into the Medium finding constraining the fix.
- Tool disagreement. The explorer-feature subagent reported 30 runs carrying `scope_deviations` (18 non-empty, 11 empty, 1 sentinel); my deterministic scan of `result.scope_deviations` over `projects/*/*/workflows/wf_*.json` returned 28 (18 non-empty, 9 empty, 1 sentinel). The non-empty count agrees, which is the load-bearing number. The 2-run gap is unresolved and likely a different glob or a nested-location match; closing it needs the subagent's exact scan command, which it did not quote.
- Unknown, requires locating the skill loader's resolution path: the Cleanup stage's `simplify` skill has no SKILL.md under `/Users/thkt/.claude/skills/`, yet it loaded and reported "the Agent tool isn't available in this context". Where its body comes from is unresolved. It does not change the root cause, since Cleanup was an amplifier and not the origin.
- Unknown, requires opening the remaining run records: 17 of the 18 non-empty `scope_deviations` runs were not traced to their commits, so how many are tracked-file sweeps rather than untracked leakage is not established. The claim "this is systemic" rests on the two verified cases (a44ee6e1 and 7165a38e) plus the aggregate counts.
- Cross-method verification. The two exhaustiveness claims were each checked with at least two methods. "No out-of-plan prohibition in any code.js implementation-agent prompt" was checked by my own grep, my own read of code.js:208-235, and the subagent's independent read of code.js:212-360. "No conditional gates on scopeDeviations" was checked by my grep across `workflows/` on both mirror sides and by reading build.js:806-830 and :978-1010 directly.
- Primary-source verification. No finding rests on external behavior. Every claim is an in-repository file:line, a git command output, or a transcript timestamp from this machine.

## Next Steps

| Intent | Next Command |
| ------ | ------------ |
| Bug investigation | `/fix` |
