# Research: wiki-structure-page-claim-verification

Generated: 2026-08-24
Session: 31d8699b-6255-410a-bdbb-f637b885c79c
Intent: Feature planning
Domain: General
Prior research: none found

## Purpose

Find a means to detect a wrong description on a `kind: structure` wiki page. scribe's reference-code sweep confirms only that a symbol name greps, so a claim about a return shape or a quantity passes it unchecked. Settle two questions: whether adrift's DR-to-code matching machinery transfers to structure pages, and whether a structure page's claims convert into tests.

## Key Findings

| Priority | Finding | Source | Next Action |
| -------- | ------- | ------ | ----------- |
| High | The claims convert into tests, measured rather than argued. A prototype parses each claim value out of the page and asserts it against `workflows/*.js`. Five of the seven checks are fully pinned: each was broken on purpose and each failed. Editing the page to `8 本` / `files 5 / tests 6` failed count and caps, and three targeted code mutations (a `stopped` reason renamed, `export const meta` moved off line 1, `UNIT_CAPS` renamed) failed the rest. The remaining two are the swing-at-nothing pair recorded below. | Prototype plus three mutation runs in the scratch (`proto.mjs`, quoted under Disconfirmation Check) | Answers "does the claim-to-test conversion hold". Feeds `/think` as the recommended route. |
| High | The nesting claim converts too, but only when the check reads call sites instead of text. Stripping comments and long string literals, then matching `workflow(` / `sibling(` call heads, returns exactly `["assert.js -> audit", "build.js -> code"]`, which is the page's claim. A plain `grep -c` counts 7 hits across 4 files, because `assert.js:18` is a comment and `audit.js:4` / `code.js:4` are `meta.description` strings. | `nesting.mjs` in the scratch; `grep -c 'workflow("\|sibling("' workflows/*.js` gives code.js 2, assert.js 2, audit.js 1, build.js 2 | The mirror image of the `build.js` finding: this shape false-positives where that one false-negatives. Feeds `/think`. |
| High | Exactly one `kind: structure` page exists: `docs/wiki/workflow-structure.md`. Cross-method verified with a frontmatter-block parse and a `head -5` grep, agreeing on one file. | `python3` frontmatter scan and `for f in docs/wiki/*.md; do head -5 ... done`, both in the scratch | Sizes the whole decision. A per-page workflow with manifest routing, reviewer fan-out, and a `docs/audit/` report needing human triage is disproportionate to N=1. Feeds `/think`. |
| High | The test route satisfies OUTCOME Behavior 1 and 2; the adrift route does not. A test in CI is a gate an agent cannot bypass and it moves verification off the human. An adrift-shaped report is discovery output that requires human triage to become a change. | `.claude/OUTCOME.md` Behavior lines; `workflows/adrift.js:443-470` writes a report and stops | Decides the route on outcome linkage rather than on mechanism fit. Feeds `/think`. |
| High | A grep-shaped test written from the page's literal wording false-fails on `build.js`. Six workflows return `{ stopped: "no-repo", ... }` inline; `build.js:138` returns `await stop("no-repo", {...})`, and `build.js:115-118` shows `stop` assembling `{ stopped: reason, ...fields }`. The page's contract claim is true behaviorally, and the naive check reports 6/7. | `workflows/build.js:115-118,138`; `grep -rn "no-repo" workflows/*.js`; prototype check `B naive-literal` | Fixes the required test shape: assert the normalized behavior, not the literal text. Feeds `/think`. |
| High | scribe's sweep is symbol-existence by construction, confirmed on the canonical side. `.ja/skills/scribe/SKILL.md:60` says the sweep confirms the file exists and the symbol name greps within it. The structure-page branch at line 66 asks whether the page matches the current implementation but attaches no procedure, no schema, and no output field. | `.ja/skills/scribe/SKILL.md:60,66`; mirrored at `skills/scribe/SKILL.md` Phase 4 steps 3-4 | Confirms the premise in the question and names the third option: tighten the branch that already exists rather than build a new mechanism. Feeds `/think`. |
| High | adrift transfers as a shape, not as code. The pipeline (fenced claim text plus candidate hits to a schema'd finding carrying direction and priority) is reusable. The extraction and routing are not: the extract prompt hard-codes "the Decision Outcome section" and reads `status` / `superseded_by`, which a structure page's frontmatter does not carry, and the direction vocabulary is `dr-update`. | `workflows/adrift.js:339-343` (extract prompt), `:355-395` (reviewer stage), `:80-84` (`DIRECTION_RULES`), `:90-93` (`fencedOutcome`) | Answers the "can adrift be reused" half: fork the shape, not the workflow. Feeds `/think`. |
| High | adrift's reviewer routing would misroute this repository. `manifestOf` returns `tsx` when `package.json` and any `*.tsx` file exist, and `REVIEWERS.tsx` is `reviewer-react-pattern`. The detect prompt's step 3 asks whether any `*.tsx` file exists with no fixture exclusion, while its exclusion list applies to step 4 only. Four tracked `.tsx` files exist, all reviewer test fixtures under `skills/use-context-reviewer-security/test/cases/`, so the routing does not depend on ignored worktree artifacts. | `workflows/adrift.js:71-77,266,319-322`; `git ls-files '*.tsx'` returns 4 files under `skills/use-context-reviewer-security/test/cases/` | A React reviewer judging a harness config repo. Even the other branch (`manifest = "ts"`) routes to `reviewer-design`, a module-depth reviewer, not a claim verifier. Reinforces fork-not-reuse. Feeds `/think`. |
| High | Two of the eight checks swing at nothing, and pinning is what surfaced both. Check `A names` stayed PASS after `polish.js` was deleted, because it filters the page's names down to files that exist and then compares counts, moving both sides at once. Check `E no-io` stayed PASS after `import { spawnSync } from "child_process"` was added to `adrift.js`, because that specifier sits outside the pattern list `node:fs|readFile|writeFile|execSync`. | Mutation run `A names PASS named=adrift,assert,audit,build,code,shake`; positive-control run `E no-io PASS violators=` with the `child_process` import in place | A grep-absence check reads identically when the property holds and when the pattern list is wrong. Any such check needs an injected violation as a standing positive control, and `A names` needs set equality instead of a count. Feeds `/think`. |
| Medium | `docs/wiki/brittle-test-removal.md` constrains the test shape, and both swing-at-nothing checks above are the shape it names: a test whose two sides move together. The page and `workflows/*.js` are independent sides, so comparing them is not self-referential; a count over a list filtered by the other side is. | `docs/wiki/brittle-test-removal.md` § 内容 and 定型手順 step 2 | Fixes step 2 of the page's procedure as a required part of writing these tests, not an optional check. Feeds `/think`. |
| Medium | `docs/wiki/deterministic-script-judgment.md` gives the split this question needs: a judgment uniquely determined by the input belongs in a script, and only the content judgment stays with the agent. Thresholds, upper bounds, ordering, section extraction, and required-set satisfaction are named as the former. | `docs/wiki/deterministic-script-judgment.md` § 内容 | Places countable and enumerable claims in tests and leaves the semantic residue to a reviewer. Feeds `/think`. |
| Medium | The precedent for converting a wiki-page claim into a CI test already runs. `skills/scribe/tests/find_wiki_rule_test.py:98` asserts that every glob this repository declares matches a tracked file, and `skills/scribe/tests/skill_contract_test.py:181-199` asserts a structure page carries exactly the six sections in order. Both run in CI. | `skills/scribe/tests/find_wiki_rule_test.py:98`; `skills/scribe/tests/skill_contract_test.py:181-199`; `.github/workflows/test.yml:40-51` | Names the destination: extend `skills/scribe/tests/skill_contract_test.py`, which already reads these pages and already runs. Feeds `/think`. |
| Medium | The claims split three ways, and the split is the answer. Countable and literal (`7 本`, `UNIT_CAPS` 3/4, `MAX_FIX_ATTEMPTS` 3, `export const meta` at line 1) convert directly. Structural and enumerable (`args.repo` required in all 7, nesting is exactly two paths, the 参照コード symbols) convert once the check normalizes: match behavior over literal text, call sites over raw grep hits, set equality over counts. Semantic (「script が持つのは制御フローと判定だけ」, the 判定-versus-制御フロー distinction) is the residue, and its grep-absence approximation is vacuous on its own. | `docs/wiki/workflow-structure.md` § 境界, 契約, 要求; each verified in the scratch | Most load-bearing claims are testable, which makes the reviewer route a small residue rather than the mechanism. Feeds `/think`. |
| Medium | Every claim on the page holds against the current code today, so this is prevention, not an open incident. Counted 7 workflows, `UNIT_CAPS = { files: 3, tests: 4 }` at `build.js:427`, `MAX_FIX_ATTEMPTS = 3` at `shake.js:55`, `export const meta` at line 1 of all 7, both nesting paths present, all 6 参照コード symbols resolving, and zero `node:fs` / `execSync` / `writeFile` hits. | `workflows/build.js:427`; `workflows/shake.js:55`; `workflows/assert.js:595`; `workflows/build.js:767`; `workflows/_lib/run-workflow.js:152`; all commands in the scratch | Record only. |
| Medium | A test's home decides whether it runs. CI runs node over `tests/*.test.js` and `skills/**/tests/*.test.js`, and python over `find agents hooks skills workflows -name '*_test.py'`. Nothing under `docs/` runs. | `.github/workflows/test.yml:40-51,54-55` | Rules out placing the check beside the page. Feeds `/think`. |
| Low | The adrift route's output has no consumer here. `docs/audit/` does not exist, carries no git history, and is not gitignored, so no adrift report has ever been committed in this repository. | `git log --oneline -5 -- docs/audit` returns nothing; `ls docs/audit/` finds no directory; `.gitignore` has no audit entry | Record only. |
| Low | `docs/wiki/` has no `.ja/` mirror. `.ja/docs/` exists and holds `SPEC.md`, `HOOKS.md`, and others, but no `wiki` directory. | `ls .ja/docs` | One canonical copy, so a claim test has one page to read. Record only. |

## Available Data

| Type | Item | Note |
| ---- | ---- | ---- |
| File | `docs/wiki/workflow-structure.md` | The only `kind: structure` page. Sections 内容 / 境界 / 契約 / 要求 / 参照コード / 由来 |
| File | `workflows/adrift.js` | Detect / Scan / Report. Extract prompt at 339-343, reviewer stage at 355-395, report at 443-470 |
| File | `skills/scribe/SKILL.md` Phase 4 | Step 3 sweeps reference code, step 4's table holds the structure-page branch |
| File | `skills/scribe/tests/skill_contract_test.py` | `WikiPageFormat` already reads `docs/wiki/*.md` in CI |
| File | `skills/scribe/tests/find_wiki_rule_test.py:98` | Existing precedent of a page claim asserted against the real repository |
| Convention | `docs/wiki/brittle-test-removal.md` | A prose-grep-only test swings at nothing. Break the implementation and confirm the failure |
| Convention | `docs/wiki/deterministic-script-judgment.md` | Deterministic judgment goes to the script, content judgment to the agent |
| Config | `.github/workflows/test.yml:40-51` | The four node globs and the python `find` roots that decide where a test runs |
| Tech | `.codegraph/codegraph.db` | Present (7.3M, dated 2026-08-17). Not used here: every question was about prose-to-code agreement, not symbol structure |

## Constraints

| Category | Constraint |
| -------- | ---------- |
| OUTCOME | A quality gate must be one an AI agent cannot bypass at its discretion, and it must move verification off the human. A report requiring human triage meets neither |
| OUTCOME | Stay inside Claude Code's hook / skill / plugin surface. No fork, no patch |
| Repository | `.ja/` is canonical and the English side mirrors in the same commit (ADR-0073). `docs/wiki/` has no mirror, but `skills/scribe/SKILL.md` does |
| Repository | A test that only matches prose against prose is removed under `docs/wiki/brittle-test-removal.md`. The two sides compared must be independent |
| Repository | The threshold and the cap live in `scripts/triage.py`, not in scribe's prose (`skills/scribe/SKILL.md` Invariants). A new deterministic judgment follows the same placement |
| Scale | One structure page exists. Any mechanism's cost is paid against N=1 |

## Disconfirmation Check

The question presumes scribe's sweep misses claim errors. Quoting the scratch verbatim.

```
$ grep -n "参照コード\|構造ページ\|kind: structure" .ja/skills/scribe/SKILL.md
60:3. 今回のスコープに関係しない既存ページも含め、`docs/wiki/*.md` 全ページの参照コードを掃除する。ファイルの存在と、ファイル内でのシンボル名の grep 一致を機械的に確認する
66:| 構造ページの記述が現在の実装と一致するか           | 現行コードに合わせて書き直す文面。落とさない         |
```

The counter-hypothesis was that something else already checks these claims. Searched every consumer of the pages:

```
$ grep -rln "docs/wiki" --include='*.py' --include='*.js' . | grep -v node_modules
workflows/code/tests/code.rules.test.js
workflows/code/tests/code.preceding-units.test.js
skills/scribe/tests/skill_contract_test.py
```

The first two test rule delivery through the plan, and the third tests frontmatter and section ordering. Neither reads a claim's value. Three hits, not zero, so the query shape is confirmed working.

The prototype and its three mutation runs, verbatim:

```
$ node proto.mjs                      # unmodified page and code
PASS  A count  page=7 actual=7
PASS  A names  named=adrift,assert,audit,build,code,polish,shake
PASS  B no-repo  7/7
FAIL  B naive-literal  6/7 <- false failure on build.js
PASS  C caps  code=3/4 page=3/4
PASS  D meta@1  7/7
PASS  E no-io  violators=
PASS  F symbols  missing=[]

$ node proto-mut.mjs                  # page mutated to 8 本 and files 5 / tests 6
FAIL  A count  page=8 actual=7
PASS  A names  named=adrift,assert,audit,build,code,polish,shake
PASS  B no-repo  7/7
FAIL  B naive-literal  6/7 <- false failure on build.js
FAIL  C caps  code=3/4 page=5/6
PASS  D meta@1  7/7
PASS  E no-io  violators=
PASS  F symbols  missing=[]

$ node proto-mut.mjs                  # page restored, UNIT_CAPS to 5 and polish.js deleted
FAIL  A count  page=7 actual=6
PASS  A names  named=adrift,assert,audit,build,code,shake
PASS  B no-repo  6/6
FAIL  B naive-literal  5/6 <- false failure on build.js
FAIL  C caps  code=5/4 page=3/4
PASS  D meta@1  6/6
PASS  E no-io  violators=
PASS  F symbols  missing=[]

$ node proto-mut2.mjs                 # audit.js "no-repo" -> "no-target"; meta moved off shake.js line 1;
                                      # node:fs/promises added to polish.js; UNIT_CAPS renamed in build.js
PASS  A count  page=7 actual=7
PASS  A names  named=adrift,assert,audit,build,code,polish,shake
FAIL  B no-repo  6/7
FAIL  B naive-literal  5/7 <- false failure on build.js
FAIL  C caps  code=?/? page=3/4
FAIL  D meta@1  6/7
FAIL  E no-io  violators=polish.js
FAIL  F symbols  missing=[["build.js","UNIT_CAPS"]]

$ node proto-mut3.mjs | grep "E no-io"   # positive control: child_process import added to adrift.js
PASS  E no-io  violators=

$ node nesting.mjs                    # claim G, call sites after stripping comments and long strings
edges: ["assert.js -> audit","build.js -> code"]
```

Five checks are pinned: each was broken and each failed. `C caps` threw rather than failed when `UNIT_CAPS` was renamed, since the regex returned null, so the prototype now defaults the match; a real test needs the same guard or it reports an error where it means a drift.

Two are not pinned, and the runs above say why. `E no-io` did fail on the `node:fs/promises` mutation, so it is pinned inside its pattern list and nowhere else. `A names` filters the page's names to files that exist and then compares the count, so a removed workflow moves both sides at once. `E no-io` matches a fixed pattern list, so `child_process` walks past it. Both are the swing-at-nothing shape `brittle-test-removal.md` names, caught here by pinning rather than by review.

## References

| Path | Description |
| ---- | ----------- |
| `.claude/workspace/research/2026-05-01-reviewer-structure.md` | Prior-research candidate, shared 1 of 5 slug words. Filename overlap only, not carried into findings |
| `docs/decisions/0103-carry-reference-rules-in-the-plan-instead-of-a-flat-index.md` | Names `find_wiki_rule.py` as the deterministic part and lists the three tests that pin the decision |
| `docs/decisions/0081-move-machinery-fan-out-from-skill-prose-to-deterministic-workflow.md` | Cited in the structure page's 由来 |
| `docs/decisions/0105-require-argsrepo-in-every-workflow.md` | The DR behind the `args.repo` contract row |
| `docs/decisions/0087-enforce-unit-size-caps-with-regeneration-in-build.md` | The DR behind the `UNIT_CAPS` requirement row |

## Coverage Notes

- The claim taxonomy generalizes from one page. Every class-level statement here is inferred from `docs/wiki/workflow-structure.md`, the only `kind: structure` page. A second page could carry a claim shape none of the three buckets fits
- adrift's `manifestOf` verdict depends on what the detect agent observes about `*.tsx` files, so the `tsx` routing is inferred from `workflows/adrift.js:266,319-322` plus the `find` hits, not from an executed adrift run
- The semantic residue has no measured size. One claim on one page falls in it, so whether a reviewer stage earns its cost is unknown, requires a second structure page or a deliberate wrong-description trial
- Cross-method verification found no tool disagreement. Both methods returned `docs/wiki/workflow-structure.md` alone
- No external claim carries the conclusion, so primary-source verification does not apply
- The `explorer-feature` spawn asked to trace adrift did not return within the session. adrift's mechanism was hand-traced instead, at `workflows/adrift.js:256-290` (Detect), `:319-322` (routing), `:333-352` (extract), `:353-395` (reviewer), `:443-470` (Report). Every finding about adrift cites those lines, not the spawn
- Advisor: invoked. It flagged that N=1 was unweighted, that the option set was a false dichotomy while scribe Phase 4's structure-page branch already exists, and that `brittle-test-removal.md` had to be read before recommending. All three are folded into the findings

## Next Steps

| Intent | Next Command |
| ------ | ------------ |
| Feature planning | `/think` |
