---
status: "accepted"
date: "2026-08-27"
decision-makers: thkt
scope: [meta, security]
---

# Grant ast-grep only to write-capable agents

## Context and Problem Statement

`skills/use-cli-ast-grep/SKILL.md` wraps `ast-grep`, the fourth code-navigation CLI alongside `ugrep`, `bfs`, and `codegraph` (`docs/SPEC.md` System boundary table). Unlike the other three, `ast-grep` writes. `ast-grep run -p '<pattern>' -r '<fix>' -U <PATHS>` applies every match's rewrite across every matched file with no per-match confirmation, and `ast-grep scan -r <rule.yml> <PATHS>` does the same from a rule file at scale (`skills/use-cli-ast-grep/SKILL.md` Commands table). `ugrep` and `bfs` have no write flag. `codegraph`'s eight subcommands (`impact`, `callers`, `callees`, `node`, `explore`, `query`, `affected`, `status`) are all reads (`skills/use-cli-codegraph/SKILL.md` Commands table). So granting `Bash(ast-grep:*)` to an agent hands it a mutation channel the other three tools never offer, and it does so through Bash, which the harness cannot mediate call by call the way it mediates `Edit`'s per-file before/after diff.

An agent's `tools:` frontmatter is a hard allowlist for its fork, checked independently of `settings.json` `permissions.allow` and of a skill's own `allowed-tools:`. A sweep of every `agents/**/*.md` file's `^tools:` line found 26 of 28 agents capping Bash at `Bash(ugrep:*), Bash(bfs:*)`: `critic-audit`, `critic-design`, `critic-evidence`, `enhancer-code`, `enhancer-evidence`, `enhancer-integration`, `explorer-feature`, `generator-test`, and 18 `reviewer-*` files. `enhancer-code` and `generator-test` also carry `Edit`/`Write`, but that tool is a separate, per-call-mediated channel; neither carries bare `Bash` or an unscoped write channel that `ast-grep -U` would match in shape.

The two exceptions are `resolver-build` (`tools: Bash, Read, Edit, LS`, bare Bash) and `generator-snapshot` (`tools: Write, Bash(python3:*)`, Bash capped to a single non-search binary). Today `ast-grep` sits in neither `settings.json` nor any agent's `tools:` line, so no agent can reach it yet, but the skill exists and a future PR granting it agent by agent has nothing on record to check the grant against.

DR-0072 already governs code search tool selection: it unified search on `ugrep`/`bfs`, retired `yomu`, and named three Reassessment Triggers, all about search capability lost (concept search, dependency-graph search, local-embedding ROI). None of the three is about which agents may hold a tool that writes. That is a different axis of decision, so this DR does not reopen DR-0072.

## Decision Drivers

- `ast-grep -U` and `ast-grep scan -r` mutate every matched file in one Bash call, a blast radius none of `ugrep`/`bfs`/`codegraph` has and that `Edit`'s per-file diff does not either.
- The audit pipeline's reviewer/challenge/verify/integrate separation (DR-0095, DR-0096, DR-0104) rests on review-role agents being unable to mutate the repository themselves; a Bash-level rewrite tool on any of them collapses that separation regardless of what other tools they already hold.
- An agent's `tools:` line is a hard, per-agent allowlist, so the boundary is enforceable at the point of grant, file by file, rather than only detectable after the fact.
- `.ja/agents/**` mirrors `agents/**` verbatim for non-prose fields (`rules/conventions/MIRROR.md`), and `docs/wiki/ja-mirror-drift.md`'s prescribed ugrep sweep is scoped to changes that migrate, delete, or rename, not to an additive one-line `tools:` grant, so a future grant needs its own record of the obligation.
- DR-0072's three Reassessment Triggers are all about search capability; none names agent write authority, so amending it would misfile this decision under a document about a different question.

## Considered Options

- Deny `Bash(ast-grep:*)` permanently to every agent whose designated role is to report findings rather than mutate the repository, and gate any future grant on the agent already holding an unscoped write channel (chosen)
- Grant `Bash(ast-grep:*)` to every agent that already holds `Bash(ugrep:*)`/`Bash(bfs:*)`, for search-tool parity
- Grant it once in `settings.json` `permissions.allow` only, leaving per-agent `tools:` untouched
- Leave the decision unrecorded and let each future PR judge the grant on its own

## Decision Outcome

Chosen option: "Deny `Bash(ast-grep:*)` permanently to every agent whose designated role is to report findings rather than mutate the repository, and gate any future grant on the agent already holding an unscoped write channel", because `ast-grep` is a write capability reached through Bash, and the harness already has exactly one boundary for write capability that review-role agents must not cross. Reviewers, critics, two of the three enhancers, the explorer, and `generator-test` produce findings or artifacts for a later stage to act on, and none of them applies its own fix to the repository outside that later stage.

`enhancer-code` and `generator-test` are named in this same denial despite holding `Edit`/`Write`, because that tool is mediated call by call, the harness records the exact before/after text of each edit, while `ast-grep -U` is one opaque Bash invocation that can rewrite an unbounded number of files matched by a pattern. Holding `Edit` does not make an agent eligible for a differently-shaped, differently-audited mutation channel.

The 26 denied agents are `critic-audit`, `critic-design`, `critic-evidence`, `enhancer-code`, `enhancer-evidence`, `enhancer-integration`, `explorer-feature`, `generator-test`, and all 18 `reviewer-*` agents. This denial is permanent: a future `settings.json` change that adds `Bash(ast-grep *)` to `permissions.allow` does not, by itself, grant any of these 26 agents the tool, because their own `tools:` line still caps Bash below it.

The two agents eligible in principle are `resolver-build` and `generator-snapshot`, because each already holds an unscoped write channel, bare `Bash`, or `Write` alongside a Bash grant scoped to a single non-search binary, that an added Bash-level rewrite tool does not widen in kind. This DR does not grant `Bash(ast-grep:*)` to either agent now. No concrete need names one, and adding it speculatively would be the same premature grant this DR exists to prevent; a concrete future need is a separate change, and it inherits this DR's eligibility test rather than reopening it.

The mirror obligation for that future change is stated here because `docs/wiki/ja-mirror-drift.md`'s sweep does not cover it. The check runs "ugrep で .ja と EN の両ツリー全域を検索し残存参照ゼロを確認する" only for a change that migrates, deletes, or renames, and adding one `Bash(ast-grep:*)` token to a `tools:` line is none of those three.

So a PR that grants the tool to `resolver-build` or `generator-snapshot` and edits only the English agent file leaves `.ja/agents/**` silently stale, and no established procedure catches it until someone happens to diff the two files. The residual is named here so a reviewer of that future PR checks both files landed in the same commit. Per DR-0106's own admission about its parallel rule 7, this is enforceable at the commit or the PR, not by a hook, because a hook sees one `Edit` call at a time.

### Consequences

- Good, because the reviewer/critic/enhancer/explorer/generator-test roster keeps the property the audit pipeline already assumes: none of them can mutate the repository outside the stage designed for it, and this DR makes that property survive a future `settings.json` change instead of resting on `settings.json` never adding the entry.
- Good, because the eligibility test (already holds an unscoped write channel) is checkable from the `tools:` line alone, so a future PR reviewer does not have to re-derive the audit-pipeline argument from scratch.
- Good, because no grant lands with this DR, so no agent's actual behavior changes today; the decision is the boundary, not a capability rollout.
- Bad, because the eligibility test is drawn by hand from today's 28 agents and does not update itself. A 29th agent added later with a `tools:` line the author did not model against this DR's test (for example, a new agent with bare `Bash` for an unrelated reason) becomes eligible without anyone deciding it should be.
- Bad, because the mirror obligation named above is, like DR-0106's rule 7, enforced by review discipline rather than a gate. Nothing stops a future single-file grant from merging; this DR only gives a reviewer something concrete to check.
- Bad, because distinguishing `Edit` (per-call mediated) from `Bash`-level rewrite (opaque, unbounded) as the eligibility line is a judgment call this DR makes once. If a later change makes `Edit` calls as opaque as a Bash invocation, or makes `ast-grep`'s Bash calls individually mediated, the line stops tracking the property it is meant to track.

## Confirmation

- No `agents/**/*.md` file among the 26 named above carries `Bash(ast-grep:*)` or bare `Bash` in its `tools:` line. Checkable by grepping `^tools:` across `agents/**/*.md`.
- A future PR that adds `Bash(ast-grep:*)` to `resolver-build` or `generator-snapshot` edits the matching `.ja/agents/**` file in the same commit.
- `settings.json` `permissions.allow` gaining a `Bash(ast-grep *)` entry does not, on its own, change what any of the 26 denied agents can invoke; each still needs its own `tools:` line widened, which this DR forbids for those 26.
- `docs/decisions/0072-discontinue-yomu-and-unify-code-search-on-ugrep.md`'s Reassessment Triggers are unchanged by this DR and still name only search-capability loss.

## Pros and Cons of the Options

### Grant `Bash(ast-grep:*)` to every agent that already holds `Bash(ugrep:*)`/`Bash(bfs:*)`, for search-tool parity

Every agent that can already search with `ugrep`/`bfs` gains `ast-grep` for the same purpose.

- Good, because every agent gets the same code-navigation toolkit, with no per-agent judgment call.
- Bad, because the 26 agents this grants it to are exactly the review-role roster the audit pipeline built to be unable to mutate the repository; parity with a read-only tool is not a reason to grant a tool that writes.
- Bad, because "search-tool parity" describes `ugrep`/`bfs`/`codegraph`, which never write; it does not extend to `ast-grep` without silently treating a write capability as a search capability.

### Grant it once in `settings.json` `permissions.allow` only, leaving per-agent `tools:` untouched

Add `Bash(ast-grep *)` to the main-loop allowlist and stop there.

- Good, because it unblocks the main loop (Claude itself) without touching any agent file.
- Bad, because it answers a question this DR does not need answered yet. No concrete main-loop need for `ast-grep` is named, and adding the permission without one is the same premature grant the chosen option avoids for agents.
- Bad, because it leaves the per-agent question exactly where it started: the 26 agents' `tools:` lines still cap Bash, so this option settles nothing about them.

### Leave the decision unrecorded and let each future PR judge the grant on its own

No policy; whoever wires `ast-grep` into an agent decides case by case.

- Good, because it defers the judgment to whoever has the concrete need, with full context on hand.
- Bad, because the same judgment (is this agent's role review-only or write-capable) would be re-derived, or skipped, on every future PR, and a skipped one is exactly how a review-role agent gains a mutation channel unnoticed.
- Bad, because `resolver-build` and `critic-audit` differ in role but not in file shape at a glance (`tools:` lines both mix `Read`/`LS`/scoped `Bash`), so a reviewer without this DR's eligibility test has no fast way to tell them apart.

## More Information

Does not supersede DR-0072. DR-0072 unified code search on `ugrep`/`bfs` and named three Reassessment Triggers, all scoped to search capability lost (concept search, dependency-graph search, local-embedding ROI). This DR answers a different question, which agents may hold a tool that writes, and none of DR-0072's triggers names it. Filing this as an amendment to DR-0072 would place an agent-authority boundary inside a document whose Decision Outcome and triggers are about tool selection for search, and a reader checking "why can't `critic-audit` rewrite files" would have to find it inside a decision about `yomu`.

Related: DR-0072 (code search unified on ugrep/bfs, does not cover write capability), DR-0095 and DR-0096 (the audit pipeline's finding-only, no-self-mutation shape for review-role agents), DR-0104 (keeps a different axis, disposition, out of audit gates the same way this DR keeps write authority out of the review roster), DR-0106 (the same commit-or-PR-enforced mirror obligation this DR reuses for the `.ja/agents/**` case).

### Before / After

| Question                                                          | Before                                        | After                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Can a `settings.json` change alone give a reviewer agent `ast-grep`? | Undecided; nothing on record to check it against | No. The agent's own `tools:` line still caps it, and this DR forbids widening that line for the 26 |
| Which agents are eligible to receive `Bash(ast-grep:*)` later?      | Undefined                                      | Only an agent already holding an unscoped write channel (bare `Bash` or `Write` with Bash capped below search), today `resolver-build` and `generator-snapshot` |
| Where does the `.ja/agents/**` mirror obligation for that grant live? | Nowhere; `ja-mirror-drift.md`'s sweep does not cover an additive one-line grant | Named in this DR's Decision Outcome and Confirmation, enforced at the commit or PR |

### Transition Plan

1. No file besides this DR changes. The denial takes effect on merge as a standing policy, not as an edit to any `agents/**/*.md` file.
2. When a concrete need names `resolver-build` or `generator-snapshot` for `Bash(ast-grep:*)`, that change adds the grant to the agent's `tools:` line, the matching `.ja/agents/**` file in the same commit, and (if the main loop also needs it) `settings.json` `permissions.allow`, then updates this DR's Confirmation checks to reflect the grant.

### Review Schedule

Reassess when a concrete need names an agent for the grant, or when a Reassessment Trigger below fires, whichever comes first.

### Reassessment Triggers

- A 29th agent is added with a `tools:` line this DR's eligibility test was not checked against.
- `Bash(ast-grep:*)` is added to any of the 26 denied agents' `tools:` lines, whether directly or through a wider grant such as bare `Bash`.
- A grant to `resolver-build` or `generator-snapshot` lands with only the English `agents/**` file edited, leaving `.ja/agents/**` stale.
- `Edit` calls, or `ast-grep`'s Bash invocations, change in a way that removes the auditability gap this DR's eligibility line depends on.
- A concrete need for `ast-grep` in a review-role agent's own workflow is named, which would mean the finding-only shape of that role no longer holds.
