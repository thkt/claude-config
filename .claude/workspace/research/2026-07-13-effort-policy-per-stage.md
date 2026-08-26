# Research: effort-policy-per-stage

Generated: 2026-07-13
Session: 1e72b5f8-0db3-48e9-8321-aab18be14c52
Intent: Understanding
Domain: General
Prior research: none found

## Purpose

Collect the implementation material for the chore that moves the workflows' agent-call effort from a flat xhigh to a per-stage policy (xhigh only on verify/judge stages, high on integrate/fix/implement stages) and constant-izes it per file. Enumerate every effort callsite, every test assertion tied to the value, the build to code propagation, and every prose mention.

## Key Findings

| Priority | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Source                                                                                                                                                 | Next Action                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| High     | The 8 effort callsites partition cleanly by agentType: after the change xhigh == exactly the 4 critic-\* agents (challenge / verify / plan-critique), high == the 4 worker agents (integrate / fix / red-green). The 4 to change to high: `audit.js:493` integrate (enhancer-integration), `polish.js:242` fix (general-purpose), `build.js:699` fix (general-purpose), `code.js:115` red/green (general-purpose).                                                                                                                                                                                                                      | audit.js:458/471/489, polish.js:181/239, build.js:448/695, code.js:115 (agentType per callsite)                                                        | `/think` maps each of the 4 to `effort: "high"`          |
| High     | Decision point: the intent's "keep xhigh" list names only audit challenge + audit verify, but two more judge callsites exist and are NOT enumerated — `polish.js:186` challenge (critic-audit) and `build.js:451` critique-plan (critic-design). Both are judge stages, so the title principle "xhigh は verify/judge 段のみ" keeps them xhigh; the enumeration-by-omission agrees (they are not in the high-ify list). Confirm both stay xhigh before implementing.                                                                                                                                                                    | polish.js:181-186, build.js:448-451; intent enumeration                                                                                                | Planner confirms polish.js:186 + build.js:451 stay xhigh |
| High     | Test-assertion update scope is exactly two files (each with its `.ja` mirror at identical line numbers): `code/tests/code.model.test.js` and `build/tests/build.behavior.test.js`. audit and polish have NO test directories, so integrate/fix effort changes need zero test updates.                                                                                                                                                                                                                                                                                                                                                   | bfs workflows -name '\*.test.js' returns only code + build test files; ugrep found no effort/xhigh in audit/polish                                     | Update only the two test files (EN+JA)                   |
| High     | build→code TDD inherits the high change automatically: `build.js:575-582` calls `sibling("code", {plan, repo, model: "sonnet"})` and passes NO effort; effort is hardcoded at `code.js:115` in `implementOpts` and spread into all 4 red/green calls. Changing `code.js:115` xhigh→high therefore lands on both the standalone and the build-delegated TDD path.                                                                                                                                                                                                                                                                        | build.js:575-582 (no effort key), code.js:115 (`{ model: input.model \|\| "opus", effort: "xhigh" }`), code.js:138/157/181/195 (`...implementOpts`)    | none (confirmed)                                         |
| Medium   | Prose mentioning xhigh in editable source, outside the code lines: `code.js:6` whenToUse ("The implementation agents run at effort xhigh." / JA "実装 agent の effort は xhigh 固定。") — must change since code red/green becomes high. `code.js:114` comment says "model/effort change" (no literal xhigh; no change needed). No other workflow meta mentions xhigh.                                                                                                                                                                                                                                                                  | code.js:6, code.js:114 (EN+JA)                                                                                                                         | Update code.js:6 meta (EN+JA)                            |
| Medium   | Out-of-scope prose that STAYS: `settings.json:445` `"effortLevel": "xhigh"` (session-global, premise says keep) and `rules/conventions/SUBAGENT.md:38` which lists `low / medium / high / xhigh / max` as the valid-value taxonomy (xhigh remains a legal level; it is a value enumeration, not a policy).                                                                                                                                                                                                                                                                                                                              | settings.json:445, rules/conventions/SUBAGENT.md:38                                                                                                    | Leave both untouched                                     |
| Medium   | Constant idiom differs per file. Only `code.js` already uses a shared object (`implementOpts`, line 115) spread via `...implementOpts`; changing its literal is a one-line edit. `audit.js`, `polish.js`, `build.js` all inline `model: "opus", effort: "xhigh"` at each callsite with no shared constant. For audit.js's split (challenge/verify=xhigh, integrate=high) either flip only the integrate literal inline (minimal, matches current inline idiom) or introduce two named constants near the top; the shared-object spread of code.js does not transfer since the three audit calls differ in agentType/label/phase/schema. | code.js:115+138/157/181/195 (spread), audit.js:461-462/474-475/492-493 (inline), polish.js:185-186/241-242 (inline), build.js:450-451/698-699 (inline) | Planner picks constant placement per file                |
| Low      | Stale memory cross-reference: `memory/reference_opus-4-8-harness-adaptation.md:77` (2026-06-11) says xhigh is an invalid effort value rejected by CC v2.1.50 validation. Superseded by the changelog (`cache/changelog.md:816` Opus 4.8 "/effort xhigh", `:1798-1800` 4.7 reintroduced xhigh). The premise (xhigh effective on both paths, opus xhigh-capable) reflects the current state; not re-investigated per premise.                                                                                                                                                                                                             | memory/reference_opus-4-8-harness-adaptation.md:77 vs cache/changelog.md:816/1798-1800                                                                 | Ignore stale note; premise stands                        |

## Available Data

| Type       | Item                                                 | Note                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File       | workflows/code.js (+ .ja)                            | code.js:6 meta, :114 comment, :115 implementOpts, :138/157/181/195 spread, :222 verify (sonnet, no effort — untouched)                                                                       |
| File       | workflows/audit.js (+ .ja)                           | :462 challenge, :475 verify (both keep xhigh), :493 integrate (→high). JA: 459/472/490                                                                                                       |
| File       | workflows/polish.js (+ .ja)                          | :186 challenge (critic-audit, keep xhigh), :242 fix (→high). JA: 178/233                                                                                                                     |
| File       | workflows/build.js (+ .ja)                           | :451 critique-plan (critic-design, keep xhigh), :699 fix:round (→high), :575-582 sibling("code") delegation. JA: 443/684                                                                     |
| File       | workflows/code/tests/code.model.test.js (+ .ja)      | Effort asserts/prose: L2 comment, L67 assert+msg, L79 test name, L91 assert+msg. L67 uses model:haiku to prove effort is model-independent                                                   |
| File       | workflows/build/tests/build.behavior.test.js (+ .ja) | Effort asserts/prose: L593/596 comment, L597 test name, L607 comment, L611 load-bearing assert. Only tests build fix (:699); critique-plan test at L235-273 asserts verdict only, not effort |
| Config     | settings.json:445                                    | `"effortLevel": "xhigh"` session-global — premise: STAYS                                                                                                                                     |
| Convention | rules/conventions/SUBAGENT.md:38                     | Effort value taxonomy `low / medium / high / xhigh / max` — STAYS                                                                                                                            |

## Constraints

| Category        | Constraint                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mirror          | `.ja/` is canonical; edit JA first, mirror to EN in the same commit (ADR-0073, MARKDOWN.md). All 4 changing files + 2 test files exist in both trees at matching line numbers |
| Test            | code.model.test.js:67/91 and build.behavior.test.js:611 are the load-bearing effort asserts; they will fail unless updated in lockstep with the code literals (EN+JA)         |
| Premise (fixed) | settings.json:445 stays; xhigh is effective and opus is xhigh-capable (binary re-analyzed); do not re-investigate                                                             |

## Disconfirmation Check

Intent is Understanding, so Phase 5 did not run. Exhaustiveness of the effort callsite set was cross-checked with a recursive sweep over both trees (verbatim from the Phase 4 scratch):

```
$ ugrep -rn 'effort' workflows/ .ja/workflows/
workflows/audit.js:462:        effort: "xhigh",
workflows/audit.js:475:        effort: "xhigh",
workflows/audit.js:493:    effort: "xhigh",
workflows/build.js:451:      effort: "xhigh",
workflows/build.js:699:      effort: "xhigh",
workflows/code.js:6:    "... The implementation agents run at effort xhigh.",
workflows/code.js:114:// Shared across all 4 Red/Green (+ retry) agent calls, so a model/effort change lands once.
workflows/code.js:115:const implementOpts = { model: input.model || "opus", effort: "xhigh" };
workflows/polish.js:186:        effort: "xhigh",
workflows/polish.js:242:        effort: "xhigh",
workflows/code/tests/code.model.test.js:2 / :67 / :79 / :91  (comment / assert / test-name / assert)
workflows/build/tests/build.behavior.test.js:593 / :607 / :611  (+ 596 / 597 via xhigh grep)
[.ja mirrors at: build.js 443/684, audit.js 459/472/490, polish.js 178/233, code.js 6/110/111,
 code.model.test.js 2/67/79/91, build.behavior.test.js 593/596/597/607/611]
(assert.js:549 / worktree.py "best-effort" are the word "effort" in prose, not effort settings)
```

Cross-method (grep `xhigh` `-rn` repo-wide vs. per-file Reads) agreed: 8 effort-setting callsites (audit×3, polish×2, build×2, code×1), the code.js:222 verify call carries no effort field, and no effort callsite lives outside the four workflow files. 0-hit was not encountered. xhigh outside workflows resolves only to settings.json:445, SUBAGENT.md:38, and non-editable snapshots (plugins/cache/**, memory/**, cache/changelog.md).

## References

| Path                                               | Description                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| workflows/code.js:115                              | The sole existing shared effort constant (implementOpts)         |
| workflows/build.js:575-582                         | build→code delegation; passes model but not effort               |
| memory/reference_opus-4-8-harness-adaptation.md:77 | Stale (2026-06-11) "xhigh invalid" note, superseded by changelog |
| cache/changelog.md:816, 1798-1800                  | Claude Code changelog reintroducing xhigh for Opus 4.7/4.8       |
| rules/conventions/SUBAGENT.md:38                   | Effort value taxonomy (keeps xhigh as a legal level)             |

## Coverage Notes

- Decision left to `/think`/planner: whether `polish.js:186` (polish challenge, critic-audit) and `build.js:451` (critique-plan, critic-design) stay xhigh. Both the title principle and enumeration-by-omission say yes; flagged because the intent's explicit "keep" list omitted them.
- Constant placement per file is a design choice, not discovered: code.js edits one literal; audit.js needs either an inline flip of the integrate literal or two named constants; polish.js and build.js each keep their judge callsite and flip only the fix callsite.
- No tool disagreement; grep and direct Reads agreed on the callsite set.
- No unverified external claim: the one external-behavior claim (xhigh validity) is a fixed premise and is corroborated by cache/changelog.md; not independently re-verified per the premise.
- Advisor: unavailable this session (advisor tool returned unavailable). Pre-synthesis adversarial pass not performed; the two-judge-callsite ambiguity is surfaced explicitly above in its place.

## Next Steps

| Intent             | Next Command                                                                            |
| ------------------ | --------------------------------------------------------------------------------------- |
| Understanding only | complete (hand the callsite map + decision point to `/think` or `/issue` for the chore) |
