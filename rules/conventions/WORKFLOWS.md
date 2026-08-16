---
paths:
  - ".claude/workflows/**"
  - "workflows/**"
  - ".ja/workflows/**"
---

# Workflow Conventions

Conventions for workflow scripts (headless deterministic pipelines) under `workflows/`.

## Naming and file placement

Discovery reads `workflows/` flat and registers only the `.js` files directly under it.

| Target            | Rule                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Script filename   | `workflows/<name>.js`. That `<name>` is the name `Workflow({name})` resolves                 |
| Shape of the name | One English word. Generic names like helper, utils, tools are not allowed                    |
| Helper script     | Place under `workflows/<name>/`. A `.js` directly under `workflows/` registers as a workflow |
| Shared harness    | Place under `workflows/_lib/`. Limited to the use imported from tests                        |

A script body carries no line ceiling. The 200 lines for a skill and a subagent does not carry over as is. The prompt strings inside a script are read by an LLM, so those follow the sentence-length conventions in PROSE.md.

## Reference notation

Write a path to a bundled asset in the form that resolves in both the dev tree (`~/.claude`) and a plugin distribution (under `~/.claude/plugins/`). In an environment installed as a plugin, the dev-tree path holds nothing.

| Target referenced                                                   | How to write it                              | Reason                                                               |
| ------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| A bundled script or template                                        | Define and call `bundled(rel)` in the script | Tries the dev tree first, then finds the target under plugins        |
| A file on the running side (`settings.json`, the `history/` output) | Bare `$HOME/.claude/<path>`                  | Not a distributed asset, so the same path holds under a plugin too   |
| Another module                                                      | Cannot be loaded                             | The script is evaluated as one function body and carries no `import` |

The `bundled` search excludes `.ja/`. A plugin distribution carries the `.ja/` side too, and the search order does not guarantee the English copy comes last, so without the exclusion the Japanese copy of the asset runs.

The `bundled` definition is duplicated per script. When the definition changes, change every script holding it in the same commit.

## Taking arguments and prompts

A script accepts `args` as either a string or an object. The string is shorthand, and each script decides what it names.

| Target                 | Convention                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Reading args           | Use an object as it stands. Parse a string as JSON only when it starts with `{`, and read it as shorthand when that fails              |
| String options         | Confirm the type with `typeof`, and fall to the default when `trim()` is empty. The `base` naming a diff comparison defaults to `main` |
| A script taking `repo` | Define `anchor(p)` and pass every prompt bound for an agent through it. anchor prepends one sentence asking for `cd <repo> &&`         |

A script where repo is optional returns the prompt untouched when repo is empty. A script where repo is mandatory always prepends.

## Degradation recording

Degradation is a branch that drops or defaults a failed or missing sub-result without recording it at loss granularity in either a structured field or `log()`. Loss granularity is the information that lets a reader reconstruct what / how many / why was lost (count, id, target name, reason).

The primary channel is the workflow return value. The snapshot is an additional channel only the audit workflow has (the `docs/audit/` write per DR-0047); implementers of the other workflows record on the return value. `log()` is a conversational supplement that surfaces on the run log a degradation the return value alone would hide from a human. When the loss granularity already lives in a structured return field, `log()` is optional.

The granularity to record per situation is below.

| Situation                                                    | Granularity to record                               |
| ------------------------------------------------------------ | --------------------------------------------------- |
| Agent response fails the schema and falls to a default       | Dropped count, target ids, that a default was taken |
| Part of the sub-result is missing and the rest continues     | Fetched count out of the total, ids of the missing  |
| A failure is swallowed and fail-open advances the next phase | What could not be verified, that it is unverified   |

## Calibration

Contrast `build.js` translate-tail as the good case against a silent empty-array default as the bad case.

| Verdict | Branch                                                                          | Recording                                                        |
| ------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Good    | Not every id is present, fail-open to the English originals                     | Emits `${byId.size}/${slots.length} translated` to `log()`       |
| Bad     | Falls an agent response to an empty-array default and continues without a count | Neither count nor reason survives in the return value or `log()` |

## Already-recorded sites

Sites that already keep loss granularity in a structured field (a return array or count) are out of scope. Duplicating the same information into `log()` is not required.

## Test coverage

Each current degradation site is guarded by its own site-specific test. No cross-cutting test guarantees the whole degradation class (that every branch keeps loss granularity). When adding a new drop / default branch, verify the loss-granularity recording in that site's own test. Existing tests do not automatically guard a new site.

## Script evaluation form

A workflow script is evaluated as one function body carrying injected parameters. The script body therefore cannot carry an `import` statement, and no script under `workflows/` holds one. Splitting shared logic into a separate module is not available as a design, so confirm this constraint before factoring duplication out across scripts. Whether dynamic `import()` works is unmeasured; run one minimal workflow to find out at the point the split becomes necessary.

Tests run as ordinary ES modules, so the constraint binds the script body alone. A shared harness imported from tests, such as `workflows/_lib/run-workflow.js`, can be placed. The test side reproduces production's global set by passing a `parsingContext` to `vm.compileFunction`.

The globals a script can read are the injected parameters `agent`, `workflow`, `parallel`, `pipeline`, `phase`, `log`, `args`, plus `budget`, `console`, `setTimeout`, and `clearTimeout`, which production supplies separately. `crypto`, `fetch`, `process`, `Buffer`, `require`, `structuredClone`, `TextEncoder`, `URL`, and `queueMicrotask` do not exist, and referencing any of them throws `ReferenceError`. `Date.now()`, `Math.random()`, and argument-less `new Date()` are replaced with an Error citing resume as the reason, while `new Date()` called with arguments and `Math.floor` are unaffected. Code generation from strings (`eval`, `new Function`) is disabled and raises `EvalError`. The harness injects all four of the separately supplied globals. `budget` carries the state of a run with no token target (`total` null, `spent()` 0, `remaining()` Infinity), and `console` output lands in the same logs as `log()`. The supplied names live in `PRODUCTION_GLOBALS` in `workflows/_lib/run-workflow.js`. Adding a name there does not create the injection, so the suite goes red until the supply is written too.

## Script resolution timing

`Workflow({name: "..."})` runs the script as it stood at session start. Editing `workflows/<name>.js` within that session leaves the pre-edit version running for every call made by name. To run the edited version, pass `Workflow({scriptPath: "<absolute path>"})`.

Checking a workflow you just fixed by its name therefore returns the unfixed result, and a fix that leaves the return shape unchanged leaves no trace that the old version ran.

scriptPath reaches the top-level call alone. A nested call inside a script (`build.js` calling code) resolves by name, so fixing `code.js` and checking it through build still runs the `code.js` from session start. Passing scriptPath on the nested side is rejected in a session where `CLAUDE_WORKFLOW_NAME_ONLY` is set. When the script you fixed runs nested, run that script directly from the top level through scriptPath.
