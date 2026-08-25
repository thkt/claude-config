---
status: "accepted"
date: "2026-08-24"
decision-makers: thkt
scope: [meta, documentation]
---

# Adopt the wiki as the current-state view over immutable DRs

## Context and Problem Statement

DR-0067 splits normative documents across three artifacts: RULES, DR, and CLAUDE.md. `docs/wiki/` was added two months later (2026-07-19, PR #208) and the boundary table never gained a fourth row. `docs/wiki/README.md` states the wiki's own domain and its `由来` gate, but nothing says how the wiki relates to the other three, so a decision's destination is settled per-artifact and never across them.

The gap shows in the artifacts themselves. Of the 13 content pages under `docs/wiki/`, 1 carries the `由来` section that `docs/wiki/README.md` declares part of the page format. For most of the other 12 the absence is correct, since scribe extracts 共通項 pages from PRs and issues and excludes design decisions by design. For `ja-mirror-drift.md` it is not: the page rests on `.ja/` being canonical and names DR-0073 in 参照コード rather than 由来. Meanwhile 105 DRs (71 accepted) hold every decision as an immutable record, so a reader asking "how does this work today" has to reconstruct the present from a decision log that was never meant to answer that.

Where does the current-state view live, and what keeps it from becoming a second source of truth against the DRs?

## Decision Drivers

- A new decision reaches its artifact on the first attempt, which is the property DR-0067 set out to provide and no longer supplies for current-state content.
- DRs stay canonical. `adrift` scans DR Decision Outcomes against code, so a change that demotes DRs removes that workflow's anchor.
- The implementer reads one page scoped to the file they are editing, not 71 accepted DRs.
- The existing page classes (共通項/`kind: structure`) absorb the change without a new mechanism.

## Considered Options

- Add the wiki as a fourth artifact with a stated domain and DR backlinks (chosen)
- Give DRs a current-state section and drop the wiki
- Fold current-state content into CLAUDE.md
- Promote wiki content into RULES

## Decision Outcome

Chosen option: "Add the wiki as a fourth artifact with a stated domain and DR backlinks", because the current-state view needs a living document while DRs are immutable by DR-0067, and the wiki already demonstrates the shape on `workflow-structure.md`.

The four responsibilities and the eight routing rules live in `rules/conventions/DOCUMENTS.md`, which auto-attaches on `CLAUDE.md`, `docs/decisions/**`, `docs/wiki/**`, and `rules/**`. Rule 1 of that file sends the rule itself to RULES and its rationale to a DR, so this DR holds the rationale and the alternatives while the table and the rules sit where a writer already has them open. Rules 1-4 come from DR-0067 unchanged. Rules 5-8 are what this decision adds:

- The wiki states the present shape a decision produced, and names the deciding record in `由来` rather than restating its rationale
- The `由来` link is gated by the counterfactual test: were that record replaced, would this page need rewriting?
- A replaced record obliges a rewrite of the pages naming it, in the same change unit, body included
- 共通項 pages come from past PRs and issues; a `kind: structure` page covers one glob-able contract group

Three points those rules compress, kept here because they carry the reasoning:

Rule 6's gate is the one `skills/scribe/SKILL.md` Phase 5 already applies; this DR raises it from a scribe-internal step to a rule the wiki is read by. A 共通項 page omits the section when no record decides its content. A `kind: structure` page keeps the heading either way, empty when no link passes the test, because `skills/scribe/tests/skill_contract_test.py` asserts its six sections by exact match.

Rule 7's body half is owned by whoever replaces the record. Phase 5 already inspects every page's links on each scribe run, but that leaves the wiki wrong until the next run, and Confirmation check 2 below sees the link alone.

Rule 8's unit is the files sharing one set of boundaries and contracts, which is what `globs` already expresses and `find_wiki_rule.py` already routes on. `workflow-structure.md` holds 7 files under `**/workflows/**/*.js` for that reason, not because "workflow" names a module. A group is raised when an implementer cannot find how the work is done there, and the page is generated from the records and the current code, then reviewed by a human.

Neither the 根拠 2 threshold nor a page cap applies to a `kind: structure` page. The glob-group axis is what bounds the count: a repository has as many groups as it has distinct contract sets, which is single digits here (`workflows/**`, `skills/**`, `hooks/**`, `rules/**`). `find_wiki_rule.py` surfaces only the pages whose globs match the files at hand, so an added page costs the planner nothing on work it does not touch.

Rules 5-8 apply to any repository carrying a `docs/wiki/`, not to this harness alone. `docs/wiki/README.md` states how to operate the wiki and stops there, naming neither this DR nor `docs/decisions/`, so the format transfers to a repository that keeps its decisions elsewhere. `find_wiki_rule.py` ships inside `skills/scribe/` and is global, while `docs/wiki/` and `docs/decisions/` are per-repository. That is the split DR-0067 already drew for DRs.

The six sections of a structure page (内容, 境界, 契約, 要求, 参照コード, 由来) stay as they are. They carry the concerns arc42's Building Block View carries, and the four corrections `5e359fc7` made were all content accuracy inside 境界/契約/要求, never the format failing to hold what had to be said.

The wiki is a derived copy under the Single Source of Truth rule: the DR is canonical, and `由来` is where the copy records the canonical's location. What the copy carries is the decision's present shape, not its text; rule 7 is the mirroring obligation that BOUNDARIES.md asks of a copy a merge cannot eliminate.

The exclusion in `skills/scribe/SKILL.md` Phase 3 step 5 stays: "Design decisions and their history belong to `docs/decisions/` and are out of scope". Architecture reaches the wiki through hand-written `kind: structure` pages, not by widening what scribe extracts. Because rule 8 exempts structure pages from the 根拠 2 threshold and PAGE_CAP, adding architecture content creates no new contention for the 3-page cap that 共通項 pages compete for. It does compete for the planner's attention: `skills/scribe/scripts/find_wiki_rule.py` caps neither how many pages a plan matches nor how long each is.

### Consequences

- Good, because the implementer reads a `globs`-scoped page instead of reconstructing the present from 71 accepted DRs.
- Good, because `adrift` keeps DR Decision Outcomes as its anchor, and rule 7 gives DR supersession a defined effect on the wiki.
- Bad, because rule 7 adds work to every supersession and nothing enforces its timing. The invariant itself is checkable (Confirmation check 2), but "in the same change unit" is not: a PreToolUse or PostToolUse hook sees one Edit at a time, so it would block the DR status edit before the wiki edit that legitimately follows it. The enforceable boundary is the commit or the PR.
- Bad, because Confirmation check 2 fires on a link that points at a dead DR and stays silent on a link that should exist and does not. Removing a `由来` line is the cheapest way to keep the check green, which runs against rule 6. The counterweight is the last Confirmation entry, which is review discipline rather than a gate.
- Bad, because the code check on a wiki page stops at symbol existence. `skills/scribe/SKILL.md` Phase 4 step 3 sweeps every page's 参照コード and greps each symbol, but the four corrections `5e359fc7` made to `workflow-structure.md` one day after it was written all sat in prose whose named symbols do exist. `adrift` gives the DRs a semantic scan and the wiki has no counterpart, while `skills/think/SKILL.md` copies 境界/契約/要求 rows verbatim into a plan, so a page that drifts in wording reaches an implementation prompt as a quoted precondition.
- Bad, because `kind: structure` is the one page class with no evidence threshold, and generation removes the hand-authoring that used to throttle it. What is left is PR review and the per-plan reading cost every plan touching its globs pays, and `skills/scribe/scripts/find_wiki_rule.py` caps neither the number of matched pages nor their length.
- Bad, because the `globs`-scoped reading benefit misses the 5 pages that carry `globs: []`. `skills/scribe/scripts/find_wiki_rule.py` can only return them as `related`, which `skills/think/SKILL.md` treats as optional, so their content stays as hard to reach as a DR's.

### Confirmation

- A wiki page added or edited after this DR carries `由来` whenever rule 6's test returns Yes. The pages that predate it are backfilled through the Transition Plan, not through this check.
- No wiki page's `由来` names a DR whose status is `superseded by DR-NNNN`, `deprecated`, or `rejected`. Only this half of rule 7 is mechanical. Relinking to the successor satisfies it while the page body still states the superseded shape, which is the state the Reassessment Triggers below name as the signal to reopen this decision. The body half rests on the reviewer, so a PR that relinks states what it checked in the body.
- `rules/conventions/DOCUMENTS.md` carries the four responsibilities and the eight rules, and its `paths:` attaches it while someone writes into any of the four. Reading the boundary does not require opening this DR.
- `docs/wiki/README.md` carries the page format and the `由来` gate while naming neither this DR nor `docs/decisions/`, so a repository can take the wiki format without taking this harness's decision log.
- A change that removes a `由来` line says why the counterfactual test now returns No. Check 2 cannot see a link that was deleted rather than left stale, so this is the only thing standing between rule 6 and the incentive to delete.

## Pros and Cons of the Options

### Give DRs a current-state section and drop the wiki

Each DR gains a section restating its outcome in present tense; the wiki is retired.

- Good, because there is one artifact and no derived copy to keep in sync.
- Bad, because DR-0067 makes DRs immutable, and a section that tracks the present is a living document inside an immutable one.
- Bad, because the current state of one module is decided by several DRs, so the reader still has to gather them.

### Fold current-state content into CLAUDE.md

CLAUDE.md absorbs procedures, conventions, and module contracts.

- Good, because CLAUDE.md is already the per-project entry point and is already a living document.
- Bad, because CLAUDE.md loads on every turn while wiki pages carry `globs` and load for the files they govern.
- Bad, because 13 共通項 pages plus structure pages would push CLAUDE.md far past the size that keeps it readable as an entry point.

### Promote wiki content into RULES

Procedures and conventions become RULES entries with `paths:` frontmatter.

- Good, because RULES already has the auto-attach mechanism that `globs` duplicates.
- Bad, because RULES applies across every project while wiki content is specific to this repository's PR and issue history.
- Bad, because DR-0067 rule 3 already routes cross-repo clusters into RULES, so this collapses a promotion path into its destination.

## More Information

Supersedes DR-0067. The three-artifact table carries over; this DR adds the fourth row and rules 5-8.

DR-0067's rules 1-4 carry over as written, but two of them do not run today and this DR does not repair them. Rule 2 asks every new DR to declare `scope:`; 6 of the 105 that predate this one do, and none of DR-0090 through DR-0105 does. Rule 3 fires on a cluster report from `~/.claude/skills/audit-undocumented/scripts/audit-adr-scopes.py`, and neither that script nor that skill exists in the tree. So two of DR-0067's three Confirmation checks cannot be evaluated. Reviving or retiring the scope-tag mechanism is a separate decision from the wiki boundary, and this DR leaves it open rather than settling it in passing.

Related: DR-0005 (documentation role separation), DR-0103 (reference rules carried in the plan).

`/challenge` verdict: NO-GO at the time of the review, since resolved. Both critic passes returned `weakened` rather than `needs_revision`, so the approach stands; what blocked adoption was rule 7's same-change-unit timing and the authorship of `kind: structure` pages. Rule 7's body is now owned by whoever flips the DR status, and rule 8 keys page creation on the glob-able contract group rather than on the DR count. Transition Plan steps 1, 2, 3, and 6 landed in the same change unit as this DR, which is what closed it. Steps 4, 5, and 7 stay open, tracked as #504, #474, and #501.

### Before / After

| Question                                          | Before                                   | After                                     |
| ------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| Where does "how we do this today" live?           | Undefined; wiki existed without a domain | `docs/wiki`, scoped by `globs`            |
| What happens to the wiki when a DR is superseded? | Undefined                                | Rule 7: rewritten in the same change unit |
| Who writes `kind: structure` pages?               | "手で書いて足す" with no routing rule    | Rule 8: by hand from code and DRs         |

### Transition Plan

1. Write the four responsibilities and the eight routing rules into `rules/conventions/DOCUMENTS.md`, with `paths:` covering `CLAUDE.md`, `docs/decisions/**`, `docs/wiki/**`, and `rules/**` so it attaches while someone is writing into any of the four. `.ja/` is canonical and the English side mirrors in the same commit.
2. Keep `docs/wiki/README.md` to operating the wiki: the page kinds, the `由来` gate including its structure-page clause, and how pages grow. It names neither this DR nor `docs/decisions/`, so the format transfers to a repository that keeps its decisions elsewhere or keeps none.
3. Move the DR-0073 reference in `docs/wiki/ja-mirror-drift.md` from 参照コード to 由来. The page's premise is that `.ja/` is canonical, so DR-0073's supersession would force a rewrite and the counterfactual test returns Yes. This is the one page besides `workflow-structure.md` known to owe a `由来` link.
4. Fix the `_candidates.md` starvation. The candidate rows never reach `skills/scribe/scripts/triage.py`, so 12 rows have been pending since 2026-07-19 across 5 scribe runs while rows with fewer pieces of evidence were promoted past them.
5. Fix #474 (scribe Phase 4 rejections drop candidate rows without producing a page).
6. Add the rule 7 link check to `skills/scribe/tests/` as an assertion over the `由来` lists and the DR frontmatter. It covers the link, not the body. It has to live under `skills/`, `agents/`, `hooks/`, or `workflows/`, since that is the find scope for Python tests in `.github/workflows/test.yml`.
7. Give code drift its own trigger, which rule 7 does not cover, through #501: a CI test that reads each `kind: structure` page's claims and matches them against the implementation. The two triggers are disjoint. A DR retired with no code change fires rule 7 alone, and code moving under a page fires #501 alone.

### Review Schedule

Reassess when the Confirmation checks are measured, at the next `/scribe` run after step 2 completes.

### Reassessment Triggers

- A wiki page's `由来` names a DR that has moved to superseded or deprecated, and the page still states the old shape
- An implementer looks for the present shape in `docs/decisions/` rather than `docs/wiki/`
- A decision has no obvious home across the four artifacts on first attempt
- A wiki page reaches a plan as a quoted precondition while stating something the code no longer does, which means the wiki needs the code-facing scan `adrift` gives the DRs
- The scope-tag mechanism DR-0067 rules 2-3 rest on is revived or retired, since rules 1-4 then need restating
