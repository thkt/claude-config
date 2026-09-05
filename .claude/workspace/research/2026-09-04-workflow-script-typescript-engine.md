# Research: workflow-script-typescript-engine

Generated: 2026-09-04
Session: ae6bb1af-a6ec-4b2b-8bba-1ad2a5e860b3
Intent: Feature planning
Domain: Infrastructure
Prior research: none found

## Purpose

Judge whether asking anthropics/claude-code#91870 to put workflow scripts (`workflows/*.js`) on the same TypeScript `$` engine as function hooks is worth filing. The disqualifier named in the request is an existing local workaround.

## Verdict

GO, with the ask reshaped, and with one local action to take first. Three of the four hypotheses hold and the fourth holds in a narrower form. No local workaround closes the duplication or the relay, but a local route to type-checking the scripts does exist and has not been taken. The `$` proposal as written would not fix the pain that has cost the most, so the comment should ask for two separable things rather than "TypeScript for workflows".

## Key Findings

| Priority | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                   | Source                                                                                                                                                                                                                                                                              | Next Action                                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | DR-0112 already considered and rejected full TypeScript, naming this exact constraint: 「workflow script は `vm.compileFunction` で注入グローバル付きのコンテキストへ読み込まれ、import を持てない。型モジュールを共有できないので、狙いである契約の型共有がその継ぎ目には届かない」. The decision is upstream-owned, so the request is the only route left                                                                               | `docs/decisions/0112-adopt-typescript-for-helper-scripts.md` § Pros and Cons / 全面 TypeScript 化する                                                                                                                                                                               | Answers the question directly: the harness has already priced this constraint and recorded that it cannot fix it locally. Cite DR-0112 in the issue comment                              |
| P1       | The author-time bundle workaround does not exist. `tsc` rejects the required top-level `return` with `error TS1108: A 'return' statement can only be used within a function body`, and `bun build --format=esm` emits `var meta = {...}` + `export { body, meta }`, destroying the `export const meta = {` marker and leaving the body inside a function                                                                                  | command output, this session (tsc 5.x on a 3-line fixture; bun build on a 2-module fixture)                                                                                                                                                                                         | Answers the question: the "already solved" branch is closed. No standard toolchain emits the script form, so a build step would mean hand-written codegen for a non-standard output goal |
| P1 | A partial local mitigation exists and is not taken. `// @ts-check` plus an ambient `.d.ts` declaring the seven injected globals type-checks a workflow script without any `import`: a wrong argument type surfaces as `TS2345`, and the `TS1108` the top-level `return` raises is suppressed by a `// @ts-ignore` on that line (measured, exit 0). No `workflows/*.js` carries `@ts-check`, and `tsconfig.json` includes only `.ts` files with no `allowJs` / `checkJs` | command output, this session; `ugrep -c '@ts-check' workflows/*.js` returns 0 for all 7; `tsconfig.json` include list | Take this locally regardless of the upstream request. It types the seam that `code.js:118`'s hand-written `typeof report.verdict === "string"` guard covers today, and it narrows what the issue comment has to claim |
| P1 | That mitigation does not reach the two pains that cost the most. An ambient declaration supplies types, not values, so it cannot deliver a shared `obj()` to the six scripts that write its shape longhand, and it cannot let a script run `python3` itself | inferred from the ambient-declaration test above plus `workflows/build.js:207-212` (obj defined once) | Narrows the issue comment to duplication and relay. Do not claim TypeScript ergonomics as the unmet need |
| P1       | The Python stages run only through an `agent()` prompt relay, and that relay has failed in production twice. `8e84e00a` records issue #604, where the agent ran the quoted test command instead of the gate and returned TAP where JSON was expected; `2f71f4ad` records a 5.7 KB report arriving truncated mid-string, both stopping a unit that the gate had actually passed                                                            | `workflows/build.js:619-622` (relayScript), `git show 8e84e00a`, `git show 2f71f4ad`                                                                                                                                                                                                | Real incident. This is the pain with the highest measured cost, and it is the one the `$` proposal as described would not fix. Lead the issue comment with it         |
| P1 | The relay is not a corner case. 35 agent-mediated command sites span the 7 scripts (16 that ask for stdout verbatim, 19 that let the agent interpret), served by 4 relay helper definitions. Every I/O crossing goes through it: git, gh, python3, node, ugrep, codex, herdr, and a plain filesystem stat | `workflows/code.js:104` relayStdout, `build.js:605,619,623`; verbatim relays at build.js:113,235,692,736,793,1031,1044,1377, code.js:148,266,413, audit.js:156,478,496, assert.js:365, adrift.js:508 | Quantifies the second ask. 35 sites is the number that shows the relay is the architecture, not an exception |
| P1 | Four distinct causes force the relay, and only one is fixable without changing the evaluation form. The script realm has no filesystem (`adrift.js:504`: 「A script cannot reach the filesystem, so the check costs an agent」), no clock or random source (`build.js:94`), no child process for any binary, and a sandbox network denial specific to herdr's Unix socket (`code.js:637`) | `workflows/adrift.js:504`, `build.js:94-95`, `audit.js:60-61`, `code.js:494-495,637-638` | Separates what the request must cover. Naming all four stops the ask being read as "TypeScript would fix it" |
| P1       | The `$` environment as quoted in the thread has "no ambient file system or network", `$.process` is contested by several commenters, and the maintainer has not committed to it. So moving workflow scripts onto `$` would deliver TypeScript and typed args and leave the Python relay exactly as it is                                                                                                                                  | issue #91870 comment line 138 quoting doc §4; comment line 687 (deafsquad's `$.http`-to-localhost reframe). Doc §4 itself unread, see Coverage Notes                                                                                                                               | Shapes the ask: request the script realm as a `$` surface and a shimless-reach noun (`$.http` to localhost, the thread's own smaller ask), not `$.process`                           |
| P2       | The no-import constraint forces the same helper to be written once per script, and the `.ja` mirror doubles every copy. Measured on the EN side: the `args` string/object parser in 7 of 7 scripts, `anchor()` in 7 of 7, `bundled()` byte-identical in 4, `shq()` byte-identical in 2. The `.ja` tree carries a matching copy of each, so the args parser and `anchor()` stand at 14 copies apiece                                       | `workflows/{adrift,assert,audit,build,code,polish,shake}.js` args parser at 27-40 / 34-47 / 26-39 / 25-35 / 11-24 / 22-35 / 26-39; anchor at 69 / 59 / 55 / 182 / 43 / 62 / 51; `bundled` at assert.js:66, audit.js:91, build.js:199, code.js:80; `shq` at build.js:203, code.js:84 | Quantifies the cost for the issue comment. 14 copies of one 2-line parser is the concrete number to cite                                                                                 |
| P2       | The clearest evidence is an extraction that happened once and could not spread. `obj(required, properties)` exists only in build.js; the other six scripts write the identical closed-object schema shape longhand, 58 times in total (12 in audit.js, 10 in assert.js, 9 each in adrift.js, code.js, polish.js, shake.js against 2 in build.js). code.js holds an extracted `shq` and a longhand schema in the same file                 | `workflows/build.js:207-212`; `workflows/code.js:86-100`; count by occurrences of `additionalProperties: false` per script                                                                                                                                                          | Strongest single number for the issue comment. A helper extracted in one file cannot reach the six files that need it                                                                    |
| P2       | The forced duplication has already drifted. The 7 `anchor()` copies reduce to 5 distinct prompt strings, since build.js, code.js and polish.js are byte-identical while audit, adrift, assert and shake each word the verb list differently. The only automated guard over any cross-script helper is a test that matches `bundled()` as source text                                                                                      | `workflows/build.js:183`, `code.js:44`, `polish.js:63` identical; `audit.js:56`, `adrift.js:70`, `assert.js:60`, `shake.js:52` divergent; `workflows/_lib/tests/reference-notation.test.js:34,44`                                                                                   | Shows the convention's same-commit rule is not sufficient. Cite as the cost of managing duplication by hand                                                                              |
| P2       | The duplication is codified as a convention rather than treated as debt, because no other option exists: 「The definition is duplicated per script, so when it changes、change every script holding it in the same commit」 and 「Splitting shared logic into a separate module is not available as a design; confirm this constraint before factoring duplication out across scripts」                                                   | `rules/conventions/WORKFLOWS.md` § Reference notation, § Script evaluation form                                                                                                                                                                                                     | Evidence that the workaround cost is already paid and documented, not hypothetical                                                                                                       |
| P2       | Hypothesis 3 holds in a narrower form than stated. The primary source defines the contract: "Pass arrays/objects as actual JSON values in the tool call, NOT as a JSON-encoded string". The shape is not undefined. The defect is that the harness delivers a stringified object anyway and does not normalize it, which `workflows/build.js:25` records as 「The harness may deliver object args as a JSON-encoded string」 | workflow-authoring skill § script body hooks (`args`); `workflows/build.js:25-35`                                                                                                                                                                                                   | Correct the wording before filing. "不定" would be dismissed; "the documented contract is not enforced at the boundary" is the accurate claim                                            |
| P2       | The args stringification caused a measured local incident. Local issue #204 records that on the #190 build, 6 of 7 runs stopped before implementation, and names two run ids (`wf_e122c593-cad`, `wf_b4d310ac-94d`) stopping as `no-issue` because the whole JSON string was read as the issue reference                                                                                                                                  | `gh issue view 204` (this repo); fix commit `37fc4a7b`                                                                                                                                                                                                                              | Real incident. The strongest single number available for hypothesis 4                                                                                                                    |
| P2       | A past session hit the wall directly and recorded why it could not be worked around: 「`code.js` の TS 化はできません… ローカルの `run-workflow.js` を型ストリップ対応にしても、本番側は Claude Code 自身の Workflow tool で、そちらは私たちが変えられません」                                                                                                                                                                            | `recall show 83540608-a74a-4d6e-930a-0534285cadb8` (2026-08-28)                                                                                                                                                                                                                     | Trace of a real detour: an audit finding had to be closed as unfixable rather than fixed                                                                                                 |
| P3       | Issue #91870 is an open Anthropic-solicited RFC (created 2026-09-03, 55 comments, labels `enhancement` / `area:hooks` / `area:plugins`) whose body says "the response from the community likely dictates whether this ships or not", and whose maintainer states 「my personal goal is for this to work on any surface powered by the Claude Code binary」 and that shipping depends on "surface questions like the one you asked"        | `gh issue view 91870 --repo anthropics/claude-code`                                                                                                                                                                                                                                 | The venue accepts this class of comment, and the Workflow tool is a surface powered by the same binary. Timing is good: the RFC is one day old                                           |
| P3       | No one in the 55 comments has raised the Workflow tool's script realm. A scan for `sandbox`, `realm`, `import`, `subagent`, `orchestrat`, `typescript`, `surface`, `Workflow tool` returns only the ordinary English word "workflow"                                                                                                                                                                                                      | `gh issue view 91870 --comments \| ugrep -i -e …`, this session                                                                                                                                                                                                                     | The contribution is not a duplicate. It adds a surface the thread has not covered                                                                                                        |
| P3       | The sandbox constraint is wider than imports: `Date.now()`, argless `new Date()` and `Math.random()` all throw, and there is no filesystem or Node API. `record.py` exists partly to mint a run id because 「a workflow script has neither a clock nor a random source」                                                                                                                                                                  | workflow-authoring skill § script body hooks; `workflows/_lib/run-workflow.js:110-133` (SANDBOX_SETUP_SOURCE); `workflows/build.js:94`                                                                                                                                              | record only. Resume determinism is the stated reason, so it is a deliberate design, not an oversight to report                                                                           |

## Available Data

| Type       | Item                                                                                 | Note                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Convention | `rules/conventions/WORKFLOWS.md`                                                     | Encodes the no-import constraint and the per-script duplication rule it forces                                    |
| Decision   | `docs/decisions/0112-adopt-typescript-for-helper-scripts.md`                         | Rejected full TS on the vm seam; its Reassessment Triggers do not include an upstream change to the script engine |
| Decision   | `docs/decisions/0114-justify-the-hooks-typescript-migration-by-the-type-contract.md` | Sibling decision on the hooks layer runtime                                                                       |
| Harness    | `workflows/_lib/run-workflow.js`                                                     | Reproduces the production realm with `node:vm`; `checkWorkflowSyntax` shows the exact compile form                |
| Scripts    | `workflows/{adrift,assert,audit,build,code,polish,shake}.js`                         | 7 scripts, 6457 lines with `_lib`                                                                                 |
| Incident   | Local issue #204, commit `37fc4a7b`                                                  | args stringification, 6 of 7 runs stopped                                                                         |
| Incident   | Commits `8e84e00a`, `2f71f4ad`                                                       | Two agent-relay failures on the gate report                                                                       |
| Test | `workflows/_lib/tests/run-workflow.test.js` | T-004 through T-009 pin the missing globals, the clock and the random source as executable spec |
| Test | `workflows/_lib/tests/reference-notation.test.js` | The only automated guard over a cross-script duplicated helper (`bundled`), written as source-text matching |
| Test | `workflows/_lib/tests/meta-contract.test.js` | Parses both trees as text because the top-level `return` means nothing can `import()` a script |
| External   | anthropics/claude-code#91870                                                         | Open RFC, 55 comments, PDF architecture doc attached                                                              |

## Constraints

| Category   | Constraint                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OUTCOME    | 「Claude Code の hook / skill / plugin 仕様の範囲内で構成する。fork や patch はしない」. An upstream request is the only route to change the script engine                                                     |
| OUTCOME    | 「Claude Code 本体機能の再実装はしない」. Writing a local bundler that re-emits the script form would sit close to this non-goal                                                                                  |
| Discovered | The script form is `export const meta = {` (pure literal) + a top-level `return`, compiled by `vm.compileFunction` with injected globals. It is neither ESM nor CommonJS, so no standard parser accepts the source |
| Discovered | `.ja/` is canonical and every workflow script is mirrored, so each forced duplicate costs two edits, not one                                                                                                       |

## Disconfirmation Check

Phase 5 did not run (intent is Feature planning). The disconfirming test was whether the pain is already solvable locally.

Command:

```
/Users/thkt/.claude/node_modules/.bin/tsc --noEmit --skipLibCheck --ignoreConfig <fixture>/a.ts
```

Raw output:

```
…/a.ts(3,1): error TS1108: A 'return' statement can only be used within a function body.
```

Command:

```
bun build <fixture>/entry.ts --target=node --format=esm
```

Raw output:

```
// …/shared.ts
var shq = (s) => `'${s.replace(/'/g, "'\\''")}'`;

// …/entry.ts
var meta = { name: "x", description: "d" };
async function body(agent) {
  return { out: shq(await agent("hi")) };
}
export {
  body,
  meta
};
```

Both tools reject or destroy the required form, so the author-time workaround is not available without hand-written codegen. The claim is not resting on absence of evidence.

Cross-check for the "nobody has raised this upstream" claim: the ugrep scan over 1078 lines of comments returned 30+ hits for the search words, of which zero name the Workflow tool or its script realm. A non-zero hit count rules out the scan silently matching nothing.

## References

| Path                                                                                             | Description                                                  |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `docs/decisions/0112-adopt-typescript-for-helper-scripts.md`                                     | The decision that rejected this exact change locally         |
| `rules/conventions/WORKFLOWS.md`                                                                 | Script evaluation form, reference notation, args conventions |
| `workflows/_lib/run-workflow.js`                                                                 | Test harness reproducing the production vm realm             |
| `workflows/build.js`                                                                             | relayScript, args decode, record.py relay                    |
| https://github.com/anthropics/claude-code/issues/91870                                           | Function Hooks RFC (open, 55 comments)                       |
| https://github.com/user-attachments/files/31802150/EXTERNAL.Function.Hooks.Core.Architecture.pdf | Architecture doc, unread. See Coverage Notes                |
| `.claude/workspace/research/2026-03-21-e2e-workflow-integration.md`                              | Prior research, shared 1 of 4 slug words                     |
| `.claude/workspace/research/2026-08-22-workflows-record-script-history-shared.md`                | Prior research, shared 1 of 4 slug words                     |

## Recommended shape of the issue comment

Not "make workflow scripts TypeScript". Two separable asks, each with a number attached.

1. Bring the Workflow tool's script realm into the `$` surface. The realm compiles through `vm.compileFunction` with injected globals and carries no `import`. One 2-line `args` parser therefore exists in 14 copies here and `anchor()` in 14, and the one helper that was extracted (`obj()` in build.js) could not reach the six other scripts, which write its shape longhand 58 times. DR-0112 rejected a local TypeScript migration on exactly this seam.
2. Give `$` shimless reach to an out-of-process stage. A workflow script cannot run `python3` itself and must ask a subagent to run it and relay stdout back verbatim. 35 command sites across 7 scripts go through that relay, and it has failed twice in production here. Once it ran the quoted inner command instead of the outer one, once it truncated a 5.7 KB report mid-string. Endorse the thread's existing `$.http`-to-localhost framing rather than asking for `$.process`.

Report hypothesis 3 as "the documented contract is not enforced at the boundary", not as "undefined", and attach the #204 number (6 of 7 runs stopped).

Do not lead with TypeScript ergonomics. A reviewer can answer that with an ambient `.d.ts`, which works today and is measured above. The two things an ambient declaration cannot supply are a shared value and an out-of-process call, and those are the asks.

Name all four relay causes, not just the language one. The realm has no filesystem, no clock or random source, no child process, and no Unix socket. A reader who sees only "TypeScript" will price the ask as ergonomics.

## Coverage Notes

- Unverified external claim: doc §4's "no ambient file system or network" is known only through a commenter's quote at line 138. `scout fetch` refuses `application/pdf` and `scout --help` lists no PDF-capable subcommand; `curl` was denied by the permission gate. To close: fetch and read `EXTERNAL.Function.Hooks.Core.Architecture.pdf` by another route before quoting §4 in the comment.
- Unknown: whether the `$` engine's own realm would permit `import` of local type modules, or would repeat the workflow realm's restriction under a new name. Requires the architecture doc, or asking directly in the thread.
- Hypothesis 3 was overstated in the request and is corrected in Key Findings. The primary source defines the `args` contract; the defect is non-enforcement, not ambiguity.
- The `explorer-feature` subagent returned after the first draft and its counts are folded in above. It corrected two premises this research had carried: `obj()` is not duplicated (it exists only in build.js, and the shape is written longhand 58 times elsewhere), and `workflows/tests/oxlint-runtime-discipline.test.js` does not encode the workflow constraint (the constraint tests are `workflows/_lib/tests/run-workflow.test.js` T-004 through T-009 and `reference-notation.test.js`).
- The relay causes are four, not one. Only the herdr Unix-socket denial (`code.js:637`) is fixable without changing the evaluation form.
- The 58 longhand schema literals were cross-verified by a second method. `ugrep -c 'additionalProperties: false' workflows/*.js` returns assert 10, audit 12, adrift 9, polish 9, shake 9, code 9, build 2, so 60 total and 58 outside build.js. The count agrees with the explorer's per-file tally.
- The 35 relay sites rest on the explorer's inventory alone. The 16 verbatim-stdout sites were spot-checked against `ugrep -rn '\.py\b' workflows/*.js`; the 19 interpreting sites were not independently counted.
- DR-0107 governs where this report lives. Research reports are tracked, and an uncommitted report is always in scope for scribe, so leaving the file untracked until review is the state the DR calls for.
- Form: this report adds `## Verdict` and `## Recommended shape of the issue comment` to the template, because the question put to the research was a value judgment and the deliverable is the shape of an upstream comment rather than a finding list.
- Advisor: invoked. It flagged the author-time bundle route as the untested disqualifier (now tested and closed), the `$`-proposal-does-not-fix-the-relay gap (now a P1 finding that reshapes the ask), and the §4 primary-source gap (now recorded as unverified above).

## Next Steps

| Intent           | Next Command |
| ---------------- | ------------ |
| Feature planning | `/think`     |
