---
paths:
  - ".claude/workflows/**"
  - "workflows/**"
  - ".ja/workflows/**"
---

# Workflow Conventions

Conventions for workflow scripts under `workflows/`.

## Naming and file placement

Discovery reads `workflows/` flat and registers only the `.js` files directly under it. The prompt strings inside a script are read by an LLM, so those follow the sentence-length conventions in PROSE.md.

| Target            | Rule                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Script filename   | `workflows/<name>.js`. That `<name>` is the name `Workflow({name})` resolves                                                         |
| Shape of the name | One English word naming the operation the workflow performs. Replace generic names like helper, utils, tools with the operation name |
| Helper script     | Place under `workflows/<name>/`. A `.js` directly under `workflows/` registers as a workflow                                         |
| Shared harness    | Place under `workflows/_lib/`. Limited to the use imported from tests                                                                |

## Reference notation

Write a path to a bundled asset in the form that resolves in both the dev tree (`~/.claude`) and a plugin distribution (under `~/.claude/plugins/`). In an environment installed as a plugin, the dev-tree path holds nothing.

The `bundled` search excludes `.ja/`. The definition is duplicated per script, so when it changes, change every script holding it in the same commit.

| Target referenced                                                   | How to write it                              | Reason                                                               |
| ------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| A bundled script or template                                        | Define and call `bundled(rel)` in the script | Tries the dev tree first, then finds the target under plugins        |
| A file on the running side (`settings.json`, the `history/` output) | Bare `$HOME/.claude/<path>`                  | Not a distributed asset, so the same path holds under a plugin too   |
| Another module                                                      | Cannot be loaded                             | The script is evaluated as one function body and carries no `import` |

## Taking arguments and prompts

A script accepts `args` as either a string or an object. The string is shorthand, and each script decides what it names. A script where repo is optional returns the prompt untouched when repo is empty; one where repo is mandatory always prepends.

| Target                 | Convention                                                                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reading args           | Use an object as it stands. Parse a string as JSON only when it starts with `{`, and read it as shorthand when that fails                                                                                            |
| String options         | Confirm the type with `typeof`, and fall to the default when `trim()` is empty. The `base` naming a diff comparison defaults to `main`                                                                               |
| A script taking `repo` | Define `anchor(p)` and pass every prompt bound for an agent through it. anchor prepends one sentence asking for `cd <repo> &&`. A stage working somewhere other than the repo takes a separate pin naming that place |

## Degradation recording

Degradation is a branch that drops or defaults a failed or missing sub-result without recording it at loss granularity in either a structured field or `log()`. Loss granularity is the information that lets a reader reconstruct what / how many / why was lost (count, id, target name, reason).

The primary channel is the workflow return value. The snapshot is an additional channel only the audit workflow has (the `docs/audit/` write per DR-0047); implementers of the other workflows record on the return value. `log()` is a conversational supplement that surfaces on the run log a degradation the return value alone would hide from a human. A site that already keeps loss granularity in a structured field (a return array or count) is out of scope, and duplicating the same information into `log()` is not required.

| Situation                                                    | Granularity to record                               |
| ------------------------------------------------------------ | --------------------------------------------------- |
| Agent response fails the schema and falls to a default       | Dropped count, target ids, that a default was taken |
| Part of the sub-result is missing and the rest continues     | Fetched count out of the total, ids of the missing  |
| A failure is swallowed and fail-open advances the next phase | What could not be verified, that it is unverified   |

## Calibration

The same fail-open splits on whether loss granularity survives.

- Kept. Not every id is present, so it falls to the English originals and emits `${byId.size}/${slots.length} translated` to `log()`
- Lost. Falls an agent response to an empty array and writes neither count nor reason to the return value or `log()`

## Script evaluation form

A script is evaluated as one function body, so it cannot carry an `import` statement. Dynamic `import()` is rejected by the pre-launch syntax check with `import() is not available in workflow scripts`. Splitting shared logic into a separate module is not available as a design; confirm this constraint before factoring duplication out across scripts.

## Script resolution timing

`Workflow({name})` runs the script as it stood at session start, so running a version you just fixed takes `Workflow({scriptPath})`. scriptPath reaches the top-level call alone; a nested call inside a script (`build.js` calling code) resolves by name. When the script you fixed runs nested, run it directly from the top level.
