# Research: assert-nested-audit-plugin-namespace-fallback

Generated: 2026-08-24
Session: 31d8699b-6255-410a-bdbb-f637b885c79c
Intent: Bug investigation
Domain: Infrastructure
Prior research: none found

## Purpose

Determine whether `assert.js`'s direct `workflow("audit")` call fails when this repository is installed as the `build` plugin, given that `build.js` carries a `sibling()` helper falling back to the `build:` namespace and `assert.js` carries no equivalent. Establish what the failure looks like at the gate and how far the same defect class reaches.

## Key Findings

| Priority | Finding | Source | Next Action |
| -------- | ------- | ------- | ----------- |
| High | Confirmed: a bare name cannot resolve a plugin-provided workflow. The plugin loader registers the composite name only (`let l = \`${t}:${a.meta.name}\``, `t` = plugin name), the user/project loader registers the bare `meta.name`, and the resolver is exact string equality with no prefix handling: `async function loo(e,t,r){return(await $3t(t,r)).find((o)=>o.name===e)}`. | CLI binary `/Users/thkt/.local/share/claude/versions/2.1.241`, greps quoted in the audit trail | Direct answer to the question. `assert.js` breaks on a plugin-only install. |
| High | The registry merge keeps user/project and plugin entries side by side and de-duplicates on the full name (`FvT`: `o=new Set(r.map(l=>l.name)), i=n.filter(l=>!o.has(l.name))`). So the defect is reachable only where `~/.claude/workflows/audit.js` is absent. On a machine carrying the dev tree, bare `audit` resolves whether or not the plugin is installed. | CLI binary 2.1.241 `FvT`; live listing from session `a7629807`: `Available: deep-research, code-review, probe:child, probe:probe, build:code, build:build, build:audit, build:polish, adrift, assert, audit, build, code, polish, shake` | Scopes the blast radius: third-party plugin-only installs. Answers the "does it fail" half with its precondition. |
| High | The failure is a soft fail with a visible reason, not a hard stop and not silent. `workflow()` throws, `parallel()` folds the rejected thunk into a `null` slot and never rejects, `audit` is `null`, so `auditReason = "nested audit returned nothing"` and `auditDegraded = true`. The gate then reads `Ready (caveat)` with that reason in `gate_reason`. The whole static reviewer half of the evidence is missing while the verdict still reads as pass-with-caveat. | `workflows/assert.js:595,597,640-646,676-690`; CLI binary `Promise.allSettled(...)` → `` let Fe=`parallel[${Te}] failed: ${xe}`;return C.push(Fe),...,null `` | Names the observable symptom for the fix's regression test. |
| High | Exactly two nesting call sites exist and only one is guarded. `build.js:767` routes through `sibling()` (`build.js:155-163`); `assert.js:595` calls `workflow("audit", ...)` bare. The `.ja/` canonical side mirrors both, so `.ja/workflows/assert.js:584` carries the same unguarded call. | `grep -rn "await workflow(" workflows/*.js`; cross-method `ugrep` over `workflows/` and `.ja/workflows/` (Disconfirmation Check) | Any fix names `.ja/workflows/assert.js:584` first, then `workflows/assert.js:595` (MIRROR.md: `.ja/` is canonical, mirrored in the same commit). |
| High | This asymmetry is already a recorded fact, so the report confirms an existing record rather than discovering one: "入れ子の呼び方は 2 経路で揃っていない。`build.js` は `sibling` を通し、bare 名が解決できなければ `build:` 名前空間へ落とす。`assert.js` は `workflow("audit")` を直に呼ぶ". What the record lacks is the consequence and the reachability condition, which this report supplies. | `docs/wiki/workflow-structure.md:15` | Confirms the wiki entry. Record only. |
| High | `assert` does ship in the plugin. The marketplace collapsed to one plugin whose source is the whole repository, and every `workflows/*.js` is auto-discovered: "Installing build clones the whole repository once, so every skill, agent, and workflow loads under the build: namespace". DR-0083's Decision Drivers name only `workflow("code")` / `workflow("audit")` *from build* as the resolution to protect, so assert's own nested call was never in that decision's scope. | `.claude-plugin/marketplace.json` (metadata.description, plugins[0].name = "build"); `docs/decisions/0083-collapse-marketplace-to-single-build-plugin.md` Decision Drivers | Explains how the gap survived DR-0083. Record only. |
| High | `sibling()`'s design is correct rather than accidental, and it is directly liftable. It tries the bare name first so the dev tree keeps working, matches on the message prefix `workflow('<name>'): no workflow with that name` (a true prefix of the thrown text, which continues `. Available: ...`), and rethrows anything else so a nested workflow's own failure is not masked. Production wraps errors into `{name, message, stack, toString}`, so `e?.message` survives the VM boundary. | `workflows/build.js:150-163`; CLI binary error template; `docs/wiki/harness-production-divergence.md` §326 | Feeds `/fix`: copy those ~9 lines into assert, on both language sides. |
| High | The copy is forced by the runtime, so the YAGNI Boundary gate (call sites >= 2) does not open onto a `workflows/_lib/` extraction here. A workflow script is evaluated as one function body and carries no `import`; dynamic `import()` is rejected by the pre-launch syntax check with "import() is not available in workflow scripts". All seven workflows contain zero `import` / `require(` lines. | `rules/conventions/WORKFLOWS.md:33,66`; `workflows/_lib/run-workflow.js:148-151`; `grep -c "^import \|require(" workflows/*.js` → 0 for all seven | Feeds `/fix`: states in advance why a shared helper is not the answer, so no cycle is spent proposing one. |
| High | The same defect class extends past `workflow()` to `agentType`, and it is larger there. The plugin agent loader builds `[pluginName, ...subdirs, name].join(":")`, so `agents/critics/critic-audit.md` in plugin `build` registers as `build:critics:critic-audit`. The workflow `agent()` lookup is `zt.find((En)=>En.agentType===_t)`, which is exact equality with no normalization and no fallback. An unresolved type throws `agent({agentType}): agent type '<t>' not found. Available agents: ...`. On a plugin-only install every bare custom `agentType` in every workflow throws. | CLI binary 2.1.241: `f=[t,...r,d].join(":")` then `return{agentType:f,...}`; `activeAgents,Qe=yn(q),zt=_Li($t,Qe,Pi),Vt=zt.find((En)=>En.agentType===_t)` | Widens the fix from "add `sibling` to assert" to "one namespace strategy across `workflow()` and `agent()` in all seven workflows". Feeds `/fix` or `/think`. |
| High | Bare-name-to-namespaced resolution exists in the CLI but not on this path. The `--agent` flag resolver falls back (`r.find(o=>o.agentType===t) ?? r.find(o=>o.agentType.endsWith(\`:${t}\`))`), and the Task tool normalizes with `srt` (NFKC, lowercase, strips whitespace, dashes, and underscore, but not colon) plus an ambiguity throw. The workflow `agent()` path has neither. | CLI binary 2.1.241, three separate resolvers quoted in the audit trail | Rules out "the runtime will handle it". Record only. |
| Medium | The agent registry merges the same way the workflow registry does: `oBt` replays built-in → plugin → userSettings → projectSettings → flagSettings → policySettings into one Map keyed on the full `agentType`, last write winning. A user agent overrides a plugin agent only on an identical string, so `critic-audit` and `build:critics:critic-audit` occupy separate keys and coexist. Duplicate reporting (`Qdf`) keys on `source \0 baseDir \0 agentType`, so a user-vs-plugin pair is never even logged as a duplicate. | CLI binary 2.1.241 `function oBt(e){...}` | Same reachability condition as the workflow defect: the dev tree masks it. Record only. |
| Medium | Nesting is one level deep, so the fix cannot regress depth: inside a child workflow the `workflow` global always rejects with `workflow() cannot be called from within a child workflow - nesting is limited to one level.` `assert` → `audit` is level one and `audit` nests nothing. | CLI binary 2.1.241 | Record only. |
| Medium | Two other causes produce the identical `no workflow with that name` message, and `sibling()` rescues neither. A restricted registry (`CLAUDE_WORKFLOW_NAME_ONLY`, or `rm("workflows")`) skips discovery entirely, and a file that failed discovery (invalid meta, oversize, unreadable, `.mjs`/`.cjs`/`.ts` extension) never registers. The `Available:` list in the error text is the fastest discriminator, since it prints the registry names verbatim. | CLI binary 2.1.241: `if(rm("workflows")||a_r())return[...noo()]`, `a_r(){return G.CLAUDE_WORKFLOW_NAME_ONLY}`; loader counters `skippedInvalidMeta` / `skippedOversize` / `skippedUnreadable` / `nearMissExt` | Record only. Relevant if a future `no workflow with that name` is chased. |
| Low | A `null` slot from `parallel()` is ambiguous. A `WorkflowBudgetExceededError` also yields `null`, taking a separate branch counted once as `parallel: <n> slot(s) dropped — token budget exceeded` instead of a per-index `parallel[i] failed:` line. A caller reading only the result array cannot tell a thrown thunk from a budget-dropped slot, so `auditReason = "nested audit returned nothing"` covers both. | CLI binary 2.1.241: `if(Ie==="WorkflowBudgetExceededError")return ge++,null;` | Record only. |
| Low | The plugin is not installed on this machine, so the defect has never executed here and no log carries it. `installed_plugins.json` holds typescript-lsp, rust-analyzer-lsp, kagami, delta, agent-browser and others; no `build@thkt-development-workflows`, and `known_marketplaces.json` has no dotclaude entry. | `cat plugins/installed_plugins.json`; `cat plugins/known_marketplaces.json` | Explains the absence of incident evidence. Record only. |

## Available Data

| Type | Item | Note |
| ---- | ---- | ---- |
| File | `workflows/assert.js:595` | The unguarded `workflow("audit", { repo, scope: auditScope, base, skipPreflight: true })` inside `parallel()` |
| File | `.ja/workflows/assert.js:584` | Canonical-side copy of the same call |
| File | `workflows/build.js:150-163` | `sibling()`, the pattern to lift |
| File | `workflows/assert.js:62-67` | `bundled()`. assert is already plugin-aware for *assets*, only its workflow-name resolution is not |
| Env | `/Users/thkt/.local/share/claude/versions/2.1.241` | Mach-O binary with the JS bundle embedded; every resolver claim above is grep-able from it |
| Config | `.claude-plugin/marketplace.json` | Single plugin `build`, source `github: thkt/dotclaude`, architecture `single-plugin` |
| Convention | `rules/conventions/MIRROR.md` | `.ja/` canonical, English mirrored in the same commit |

## Constraints

| Category | Constraint |
| -------- | ---------- |
| OUTCOME Constraint | Compose within the Claude Code hook / skill / plugin spec; no fork or patch. A message-string `catch` is the only branch available, since `workflow()` exposes no "does this name resolve" query. |
| OUTCOME Non-goal | Distribution to other members and public marketplace release are not the primary purpose. The defect is reachable only on a plugin-only install, so it sits in the deprioritized half. The plugin and DR-0083 are maintained deliverables, and this is the direct answer to the question, so it earns an action on that basis. |
| Convention | `.ja/workflows/assert.js` is canonical; the English mirror lands in the same commit. |
| Runtime | Message-string matching is the fix's weak point: if Claude Code rewords the error, the fallback stops firing silently. |

## Hypotheses Log

| Hypothesis | Discriminating test | Result |
| ---------- | ------------------- | ------ |
| The runtime falls back to a bare name inside the same plugin, so `workflow("audit")` resolves and there is no bug | Read the resolver in the CLI binary and the live registry key set | Eliminated. `loo()` is `find(o => o.name === e)`, exact equality. The live listing shows `probe:child` / `probe:probe` with no bare `child` / `probe`, and that probe plugin had no dev-tree copy |
| `assert.js` is not bundled in the plugin, so the call never runs under a namespace | Read `.claude-plugin/marketplace.json` and DR-0083 | Eliminated. One plugin sourcing the repository root; `skills/`, `agents/`, `workflows/` are auto-discovered unconditionally, and the manifest fields are advertising only |
| The failure is loud: the assert run stops and the operator sees an error | Read `parallel()` in the CLI binary and assert's degradation branch | Eliminated. `parallel()` resolves with `null` at the failed index; assert converts that into `Ready (caveat)` plus the reason `nested audit returned nothing` |
| Another call path in assert reaches audit, so the fan-out survives | Cross-method grep for `workflow(` across `workflows/` and `.ja/workflows/` | Eliminated. One call site per language side; no second path |
| The bare name resolves on thkt's machine, making the defect unreachable everywhere | Read the registry merge `FvT` and the live `Available:` listing | Confirmed for the dev tree, not for a plugin-only install. Both entries coexist and user/project wins the full-name collision |
| The defect is confined to `workflow()` names, so the fix is assert-local | Grep the binary for the agent loader and the `agent()` agentType lookup | Eliminated. Plugin agents register as `[pluginName, ...subdirs, name].join(":")` and the lookup is exact equality that throws when it misses, so every bare custom `agentType` in every workflow fails the same way |
| An unresolved `agentType` degrades quietly to `general-purpose`, which would be worse than throwing | Read the `if(!Vt)` branches in the binary | Eliminated. All three branches throw: permission denial, tool-pool denial, and `agent type '<t>' not found`. There is no fall-through |

## Same-origin Sweep

The root-cause file is `workflows/assert.js` (call site introduced with the workflow itself). The origin is not a commit to one file but a class: a bare cross-boundary name written in a script that also ships namespaced. Swept scope is every bare name a workflow hands to the runtime: nested `workflow()` names and `agentType` values across all seven workflows and their `.ja/` mirrors.

| Sibling | Consumer (spec source) | Result |
| ------- | ---------------------- | ------ |
| `workflows/build.js:767` `sibling("code")` | `workflow()` name resolution | Guarded. Falls back to `build:code` |
| `workflows/assert.js:595` `workflow("audit")` | `workflow()` name resolution | Unguarded. The defect |
| `workflows/assert.js` agentTypes: `critic-audit`, `critic-evidence`, `enhancer-evidence` | `agent()` agentType resolution | Unguarded. Throws on a plugin-only install |
| `workflows/audit.js` agentTypes: `critic-audit`, `critic-evidence`, `enhancer-integration`, `generator-snapshot` | `agent()` agentType resolution | Unguarded. Throws on a plugin-only install |
| `workflows/build.js` agentTypes: `reviewer-conformance`, `reviewer-reuse` | `agent()` agentType resolution | Unguarded. Throws on a plugin-only install. `build.js` guards `workflow()` but not `agent()` |
| `workflows/polish.js` agentTypes: `critic-audit`, `enhancer-code` | `agent()` agentType resolution | Unguarded. Throws on a plugin-only install |
| `workflows/shake.js` agentType: `critic-audit` | `agent()` agentType resolution | Unguarded. Throws on a plugin-only install |
| `workflows/adrift.js`, `workflows/code.js` | `agent()` agentType resolution | Clean. Only `general-purpose`, which is built in |
| `bundled()` in `assert.js:62-67`, `audit.js:88-91`, `build.js:164-165` | Filesystem asset paths | Guarded. Tries `$HOME/.claude` then `find $HOME/.claude/plugins`, excluding `*/.ja/*` |

## Disconfirmation Check

Covered by Phase 5 elimination. The exhaustiveness claim ("exactly two nesting call sites") was cross-checked with a second tool:

```
$ ugrep -n --include='*.js' -e 'workflow\(' workflows/ .ja/workflows/
workflows/assert.js:18:// 1. The static reviewer fan-out reuses the nested workflow("audit") instead of duplicating
workflows/assert.js:595:    () => workflow("audit", { repo, scope: auditScope, base, skipPreflight: true }),
workflows/code.js:10:// args arrives as an object from a nested workflow("code", {plan}) call, as a string otherwise.
workflows/build.js:157:    return await workflow(name, a);
workflows/build.js:159:    const unresolved = `workflow('${name}'): no workflow with that name`;
workflows/build.js:161:    return await workflow(`build:${name}`, a);
.ja/workflows/code.js:10:// args は入れ子の workflow("code", {plan}) からは object で、それ以外は文字列で届く。
.ja/workflows/assert.js:18:// 1. 静的 reviewer fan-out は routing 表を複製せず workflow("audit") の入れ子で再利用する
.ja/workflows/assert.js:584:    () => workflow("audit", { repo, scope: auditScope, base, skipPreflight: true }),
.ja/workflows/build.js:154:    return await workflow(name, a);
.ja/workflows/build.js:156:    const unresolved = `workflow('${name}'): no workflow with that name`;
.ja/workflows/build.js:158:    return await workflow(`build:${name}`, a);
.ja/workflows/audit.js:4:    '... 単体でも、assert から workflow("audit") 経由の入れ子でも呼べる。',
```

`grep -rn "sibling\|await workflow(" workflows/*.js` returned the same two call sites independently. Both methods agree.

The recorded live probe was checked for its own truncation before being trusted: `throwcheck-wf_16a4cde0-102.js` caps the message with `String(e && e.message).slice(0, 120)`, so its `Available: deep-research, code-review, probe:chi` list is cut by the probe, not by the registry. The untruncated key set comes from the Workflow tool in session `a7629807` instead, and it contains `probe:child`/`probe:probe` with no bare `child`/`probe`.

## References

| Path | Description |
| ---- | ----------- |
| `/Users/thkt/.claude/workflows/assert.js` | Line 595 holds the unguarded nested call; lines 640-690 hold the degradation and gate rule |
| `/Users/thkt/.claude/.ja/workflows/assert.js` | Canonical side, line 584 |
| `/Users/thkt/.claude/workflows/build.js` | Lines 150-163 hold `sibling()`, the pattern to lift |
| `/Users/thkt/.claude/docs/wiki/workflow-structure.md` | Line 15 already records the asymmetry |
| `/Users/thkt/.claude/docs/wiki/harness-production-divergence.md` | §326: production wraps errors into `{name, message, stack, toString}` with a null prototype |
| `/Users/thkt/.claude/docs/decisions/0083-collapse-marketplace-to-single-build-plugin.md` | Single-plugin collapse; names only build's nested calls as the resolution to protect |
| `/Users/thkt/.claude/.claude-plugin/marketplace.json` | Plugin name `build`, whole-repository source |
| `/Users/thkt/.claude/projects/-Users-thkt--claude/629b0c88-dcdb-44d1-a584-61abc0ee653e.jsonl` | 2026-07-06 live plugin probe: namespacing, hot-load, bundled-asset find |
| `/Users/thkt/.claude/projects/-Users-thkt--claude/a7629807-b539-4979-9fda-d1d2250c56c5.jsonl` | Untruncated registry key set with the plugin installed beside the dev tree |
| `/Users/thkt/.claude/projects/-Users-thkt--claude/2a259b54-2ca6-4764-885a-b2f16be47d17.jsonl` | Measurement of namespaced agent registration (`build:reviewer-reuse`, 114 agents) |
| `.claude/workspace/research/2026-03-21-e2e-workflow-integration.md` | Prior research, shared 1 |
| `.claude/workspace/research/2026-08-02-audit-reviewer-refinement.md` | Prior research, shared 1 |
| `.claude/workspace/research/agent-friendly-cli-audit.md` | Prior research, shared 1 |

## Coverage Notes

- Closed during the advisor's second pass: the `agentType` question was answered from the same binary rather than a live probe. It does not resolve bare, so the fix scope is all seven workflows, not assert alone.
- Unknown: whether `agent()` under a plugin also needs the subdirectory segments. The loader joins `[pluginName, ...subdirs, name]`, and this repository nests agents (`agents/critics/critic-audit.md`), which predicts `build:critics:critic-audit` rather than `build:critic-audit`. The one measured example, `build:reviewer-reuse`, dates from a tree whose agents may have been flat. Close it by listing the registered agent names on a plugin-only install, or by reading how the directory walker feeds `r`.
- Unknown: whether the `parallel[i] failed: <msg>` line reaches the workflow's return value or only the progress log. It is pushed onto an array also fed by a `recordFailure` hook; where that array drains was not traced. Close it by reading the hooks factory return object in the same bundle region.
- Unknown: what gates `rm("workflows")` beyond the flag table. Close it by identifying the `Rd()` predicate in the bundle.
- Every binary claim is pinned to version 2.1.241. A Claude Code upgrade can change the resolver or the error wording, which is also the fix's own weak point.
- Cross-method verification agreed: `grep` and `ugrep` returned the same two nesting call sites.
- A second, independent cause of both errors exists and no fallback rescues it: under `rm("workflows")` / `rm("agents")` (the `Rd()` mode) or `CLAUDE_WORKFLOW_NAME_ONLY`, discovery is skipped and only built-ins register.
- Advisor: invoked twice. The first pass blocked on the resolver key set (resolved: `probe:child` present, bare `child` absent, plus the binary's exact-match resolver), required widening to `agentType` (done, landed as an unknown with a named probe), and corrected two framings. The failure is a soft fail with a visible reason rather than silent, and the reachability condition (dev-tree `audit.js` absent) belongs beside the finding. The second pass sent the `agentType` question back to the binary instead of a live probe, which closed it, and flagged that a `workflows/_lib/` extraction is unavailable.

## Next Steps

| Intent | Next Command |
| ------ | ------------ |
| Bug investigation | `/fix` |
