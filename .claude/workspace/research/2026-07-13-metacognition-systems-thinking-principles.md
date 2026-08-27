# Research: metacognition-systems-thinking-principles

Generated: 2026-07-13
Session: 11acf276-b1d0-4a7c-8601-ede07a9691d5
Intent: Understanding
Domain: General
Prior research: none found

## Purpose

Identify the established literature that verbalizes three recurring user corrections ("メタ認知して" / "局所最適でなく全体最適" / "短期的解決でなく長期的視点") so candidate additions to `rules/PRINCIPLES.md` can be organized, and judge whether any pre-implementation check (PREFLIGHT) should absorb them.

## Key Findings

Recommendation leads. The three instructions map to three literature clusters, but they overlap the existing rule set unevenly. Only the global-vs-local cluster has zero existing coverage. The remainder is already carried by Occam's Razor, Outcome-driven, Strong Inference, and the CLAUDE.md triggers, so the Occam-respecting move is one new principle plus one extension plus three procedural PREFLIGHT triggers, not a wholesale import.

| Priority | Finding                                                                                                                                                                                                                                                                                                                                 | Source                                                                                                                                      | Next Action                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| High     | 全体最適 (global-over-local) is the one cluster with no existing rule. Nothing in `rules/` or CLAUDE.md names systems thinking, local optima, or suboptimization. The nearest neighbor is Measurement's metric-gaming note                                                                                                              | `rules/` term scan (Disconfirmation, 0 hits for local/global optim, suboptim, systems thinking) + full Read of `rules/PRINCIPLES.md`        | Add one Systems Thinking principle; see Available Data                            |
| High     | The strongest canonical anchors for 全体最適 are Theory of Constraints ("a system of local optimums is not an optimum system", Goldratt, The Goal) and Deming's suboptimization ("a component's obligation is the aim of the whole system, not its own output")                                                                         | scout search Goldratt / Deming (20 + 19 sources each, converging)                                                                           | Cite one of the two as the principle's rationale line                             |
| Medium   | メタ認知 is partially covered. CLAUDE.md already has the monitoring trigger "Work productive but outcome not closer → Stop and re-derive" and Strong Inference (3+ hypotheses). The additive nuance is Double-loop learning (question the governing assumption, not just the error)                                                     | Argyris double-loop (Wikipedia, infed.org); CLAUDE.md Foundation table; `rules/PRINCIPLES.md:16` Strong Inference                           | Extend Strong Inference / trigger table rather than add a new top-level principle |
| Medium   | 短期的解決 is the most-covered cluster. Occam's Razor Conflict-Resolution line ("does not count temporary symptom relief as an achievement") and CLAUDE.md Fix ("Root cause / Symptom patches") already encode it. Additive value is vocabulary only (technical debt, second-order thinking, Shifting-the-Burden)                       | `rules/PRINCIPLES.md:43`; CLAUDE.md Completion table `Fix` row; scout search Toyota Way / second-order                                      | Strengthen wording, do not add a standalone principle                             |
| Medium   | PREFLIGHT is the correct home for the actionable checks, not PRINCIPLES.md. Per the user's own harness philosophy (memory `feedback_claude-md-as-execution-philosophy`), PRINCIPLES holds cognitive judgment; a check that runs as a step is procedure. Pre-mortem, second-order "and then what?", and Chesterton's Fence are procedure | memory `feedback_claude-md-as-execution-philosophy`; `rules/core/PREFLIGHT.md` structure (Interpretation Clarity, Rationalization Counters) | Insert three triggers into PREFLIGHT; see Available Data                          |
| Medium   | Dilution risk is real. The Priority Matrix already lists 17 principles, and Measurement itself warns "too many indicators dilute attention". Adding one cluster to first-class status and folding the other two is the reading that respects that warning                                                                               | `rules/PRINCIPLES.md:5-23` (17 rows); `rules/PRINCIPLES.md:82`                                                                              | Prefer fold over add for clusters A and C                                         |
| Low      | Boy Scout Rule ("leave code cleaner than you found it") is a tempting long-term candidate but directly contradicts the existing Overeagerness rule "A bug fix does not clean surrounding code". Do not import it                                                                                                                        | `rules/PRINCIPLES.md:94` Overeagerness table                                                                                                | Exclude from candidates                                                           |

## Available Data

Concept catalog, organized by the three instruction clusters. Delete-test verdict answers "if this were added, would agent behavior change, or is it already carried elsewhere?" per the user's `feedback_skill-no-op-removal` discipline.

### Cluster A — メタ認知して (metacognize)

| Concept              | Canonical source                                                              | What it adds                                                                                                            | Delete-test verdict                                                                                     |
| -------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Metacognition        | Flavell, "Metacognition and Cognitive Monitoring", American Psychologist 1979 | Naming the monitor-and-regulate-own-cognition loop                                                                      | Partial redundancy with the "stop and re-derive" trigger                                                |
| Reflection-in-action | Schön, The Reflective Practitioner 1983                                       | Thinking about the work while doing it                                                                                  | Overlaps metacognition; no independent add                                                              |
| Double-loop learning | Argyris and Schön, Theory in Practice 1974                                    | Single-loop fixes the error inside current assumptions; double-loop questions the governing assumption that produced it | Additive. 5-Whys / reviewer-causation targets the code defect, not the agent's own governing assumption |

### Cluster B — 局所最適でなく全体最適 (global over local)

| Concept                              | Canonical source                                                    | What it adds                                                                                          | Delete-test verdict                                       |
| ------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Systems Thinking                     | Meadows, Thinking in Systems 2008; Senge, The Fifth Discipline 1990 | The integrating lens: parts interact, the whole is not the sum, feedback and delay matter             | Additive. Zero existing coverage                          |
| Theory of Constraints / local optima | Goldratt, The Goal 1984                                             | "A system of local optimums is not an optimum system"; the bottleneck governs whole-system throughput | Additive. Sharpest, most quotable anchor for this cluster |
| Suboptimization                      | Deming, System of Profound Knowledge (Appreciation for a System)    | A component's obligation is the aim of the whole, not maximizing its own output                       | Additive. Directly names the failure mode                 |
| Conway's Law                         | Conway 1968                                                         | Org structure mirrors system structure                                                                | Tangential to the instruction; note only                  |

### Cluster C — 短期的解決でなく長期的視点 (long-term over short-term)

| Concept                                         | Canonical source                                                             | What it adds                                                                                  | Delete-test verdict                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Technical debt                                  | Cunningham 1992; Fowler quadrant (deliberate/inadvertent x prudent/reckless) | Vocabulary for "a shortcut now accrues future interest"                                       | Vocabulary only; Occam's no-symptom-relief already covers the behavior |
| Second-order thinking                           | Marks, The Most Important Thing 2011 ("second-level thinking")               | "And then what?" — consequences of the consequences                                           | Mild gap beyond Outcome-driven's "serves outcome?"                     |
| Shifting the Burden (archetype)                 | Senge, The Fifth Discipline 1990                                             | Repeated symptomatic fixes atrophy the fundamental solving capacity                           | Strong framing for why patches compound; overlaps Occam                |
| Toyota Way Principle 1                          | Liker, The Toyota Way 2004                                                   | "Base decisions on a long-term philosophy, even at the expense of short-term financial goals" | Restates the cluster; no independent behavior add                      |
| Make the change easy, then make the easy change | Kent Beck                                                                    | Software-concrete long-term move                                                              | Additive as a tactic, not a principle                                  |

### PREFLIGHT insertion candidates (procedure, not philosophy)

| Check                                 | Canonical source                                  | Where it fits in PREFLIGHT                                                                                                   | Delete-test verdict                                                                       |
| ------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Pre-mortem                            | Klein, "Performing a Project Premortem", HBR 2007 | Before implementation: assume it failed, list why                                                                            | Additive. No current step asks "imagine this failed"                                      |
| Second-order check ("and then what?") | Marks 2011                                        | Scope check: one-line forward-consequence line                                                                               | Mild add; forward-looking complement to the outcome check                                 |
| Chesterton's Fence                    | G.K. Chesterton, The Thing 1929                   | Rationalization Counters: reinforces "Already understand the codebase" and "Search the project for existing implementations" | Additive direction (understand-why-before-removing) on top of existing find-first counter |

## Constraints

| Category           | Constraint                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outcome            | Additions must serve the harness-quality outcome (move QA from LLM discretion to deterministic layers). A principle is philosophy the agent applies; it is not itself a deterministic gate (`.claude/OUTCOME.md`) |
| Harness philosophy | PRINCIPLES.md / CLAUDE.md carry cognitive judgment only; anything that runs as a step is procedure and belongs in PREFLIGHT / hooks / skills (memory `feedback_claude-md-as-execution-philosophy`)                |
| Occam / dilution   | 17 principles already listed; Measurement warns against attention dilution. Prefer fold and extend over new top-level rows (`rules/PRINCIPLES.md:82`)                                                             |
| Delete test        | Each candidate must change agent behavior if added; no-op quality训示 are rejected (memory `feedback_skill-no-op-removal`)                                                                                        |
| Mirror             | `.ja/` is canonical; any actual edit to PRINCIPLES.md or PREFLIGHT.md mirrors JA to EN in the same commit (ADR-0073). This research report is not itself mirrored                                                 |
| Non-conflict       | A candidate must not contradict an existing rule (Boy Scout Rule vs Overeagerness)                                                                                                                                |

## Disconfirmation Check

Phase 5 did not run (intent is Understanding, not Bug investigation). Two negative/exhaustiveness claims are load-bearing and were cross-checked.

Claim 1: no prior research exists for this subject.

```
$ for slug in metacognition systems-thinking principles global-optim local-optim long-term preflight second-order; do
    find . -path '*/workspace/research/*' -name "*${slug}*.md"; done
-- metacognition --   (no hits)
-- systems-thinking --   (no hits)
-- principles --   (no hits)
-- global-optim --   (no hits)
-- local-optim --   (no hits)
-- long-term --   (no hits)
-- preflight --   (no hits)
-- second-order --   (no hits)
```

Cross-check: the same `workspace/research` glob returns 21 existing files (listing succeeded), so the directory is readable and the 0 hits are true absence, not a path error.

Claim 2: the candidate concepts are absent from the current rule set (drives the "add vs fold" recommendation). Verified by two methods: full Read of `rules/PRINCIPLES.md` (99 lines) plus a grep sweep of the whole `rules/` tree and CLAUDE.md.

```
$ for term in system metacognit "second-order" "technical debt" "local optim" "global optim" whole suboptim pre-mortem premortem double-loop chesterton reflect; do
    grep -rli "$term" rules/; done
[2] system      -> rules/PRINCIPLES.md (line 96 "system boundaries"), rules/core/OUTCOME.md (line 19 "human / AI agent / system")
[0] metacognit
[0] second-order
[0] technical debt
[0] local optim
[0] global optim
[0] whole
[0] suboptim
[0] pre-mortem / premortem
[0] double-loop
[0] chesterton
[1] reflect     -> rules/conventions/MARKDOWN.md (unrelated)

$ grep -ni "systems thinking|metacognit|second-order|whole|long-term|root cause" CLAUDE.md
36: | Fix | Root cause resolved | Symptom patches |   (only hit)
```

Both "system" hits are unrelated to systems thinking (a boundary reference and a subject enumeration). The only long-term/short-term coverage in CLAUDE.md is the Fix row. Absence of the other concepts is confirmed across two methods.

## References

| Path                                                                                                           | Description                                                     |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| jgregorymcverry.com/.../flavell1979MetacognitionAndCogntiveMonitoring.pdf                                      | Flavell 1979, primary source for metacognition                  |
| en.wikipedia.org/wiki/Double-loop_learning; infed.org (Argyris)                                                | Double-loop learning, single vs double loop                     |
| fortelabs.com/blog/theory-of-constraints-102-local-optima; Goldratt, The Goal                                  | Local optima / Theory of Constraints                            |
| deming.org/explore/sopk; blog.deming.org "Optimize the overall system not the individual components"           | Deming suboptimization / System of Profound Knowledge           |
| en.wikipedia.org/wiki/System_archetype; thesystemsthinker.com "Shifting the Burden"                            | Senge systems archetypes                                        |
| apqc.org "The Toyota Way Starts with a Long-Term Philosophy"; en.wikipedia.org/wiki/The_Toyota_Way             | Toyota Way Principle 1                                          |
| hbr.org/2007/09/performing-a-project-premortem                                                                 | Klein pre-mortem                                                |
| fs.blog/chestertons-fence                                                                                      | Chesterton's Fence                                              |
| fs.blog/second-order-thinking; mindtools Howard Marks second-level thinking                                    | Second-order thinking                                           |
| rules/PRINCIPLES.md, rules/core/PREFLIGHT.md, CLAUDE.md                                                        | Current rule set (add vs fold baseline)                         |
| memory feedback_claude-md-as-execution-philosophy, feedback_skill-no-op-removal, feedback_no-symptomatic-fixes | User harness philosophy governing placement and the delete test |

## Coverage Notes

- Placement decision (PRINCIPLES vs PREFLIGHT) rests on memory `feedback_claude-md-as-execution-philosophy`, read from the loaded MEMORY.md index, not the underlying topic file. If the exact wording matters for the eventual edit, open the topic file before committing.
- Unification option not fully explored: Senge frames systems thinking as the umbrella that already contains both local-optima (Cluster B) and feedback-delay / short-termism (Cluster C). A single "Systems Thinking" principle carrying both facets is more Occam-friendly than two entries; this report proposes it but does not settle the exact split.
- Toyota Way Principle 1 exact Liker wording is triangulated across multiple secondary sources (apqc, leanblog, Wikipedia) rather than the primary book text; a direct `scout fetch` of the Wikipedia page did not surface the line under the grep pattern used. Treat the quoted wording as `verified via convergent secondary sources`, not primary.
- No claim crosses a repository boundary or drives a PR in this report; it is an Understanding-only investigation. Any actual edit to PRINCIPLES.md / PREFLIGHT.md is a separate follow-up that must respect the JA-canonical mirror.
- Advisor: skipped, tool returned unavailable. Compensated with a self-applied cross-method disconfirmation (two methods for the exhaustiveness claim) and an explicit conflict scan (Boy Scout Rule vs Overeagerness).

## Next Steps

| Intent             | Next Command |
| ------------------ | ------------ |
| Understanding only | complete     |

If the user decides to act on the recommendation, the follow-up is a `/think` or direct edit that (a) adds one Systems Thinking principle to the Priority Matrix, (b) extends Strong Inference with a metacognitive-monitoring / double-loop line, and (c) inserts Pre-mortem, second-order check, and Chesterton's Fence into PREFLIGHT, all mirrored JA to EN in one commit.
