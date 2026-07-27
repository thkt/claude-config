---
name: challenge
description: Two-phase challenge that judges whether a discovered problem is real and whether a proposed idea is usable. Phase 1 loops subagent verification and advisor judgment over evidence (OUTCOME.md + parallel subagents) to self-resolve design-tree branches, asking the user only the irreversible residual and proceeding on stated assumptions for the rest. Phase 2 spawns two critic-design subagents (internal attack / OUTCOME.md attack) as devil's advocate input. The verdict leads the output as a simple GO / NO-GO. Do NOT use for code review findings (use /audit) or outcome assertion (use /assert which has built-in adversarial testing).
when_to_use: devils advocate, 反論, チャレンジ, challenge, 叩いて, 穴探し, grill me, 壁打ち
allowed-tools: Read LS Task AskUserQuestion
model: opus
argument-hint: "[proposal file | description]"
---

# /challenge - GO / NO-GO verdict on a proposal

Judge the proposal in two phases, so the next decision starts from a verified GO / NO-GO.

## Input

`$ARGUMENTS` carries the target. It may be a proposal file path or a description. If empty, stop and ask the user to specify the target; do not infer it from the conversation. When multi-line, the first line is the target title.

## Phase 1 Grill

Grill the proposal from evidence on its own, then return only the unresolved residual to the user, sorted by reversibility.

1. Read OUTCOME.md if present. If absent, infer the outcome from $ARGUMENTS and the conversation and confirm it via AskUserQuestion. The confirmed outcome becomes the evaluation axis of the Phase 2 outcome attack
2. List the open questions in the proposal and sort them. A question evidence settles to one answer is a fact; one needing a choice, such as priority / scope / trade-offs, is a preference. Sort by the nature of the question, not by advisor confidence
3. Run the verification loop. subagents check facts in parallel, advisor re-checks the sorting and names the next evidence, and the main session decides whether to continue. Break when more evidence no longer changes the sorting. Cap 3 rounds. Unsettled questions carry over to the residual
4. If a verified fact overturns the proposal's core, skip Phase 2 and put the grounds for overturning in the Why. The core is overturned when the targeted state already holds or it contradicts a fact. Do not stop on advisor opinion alone. If only a sub-claim broke, proceed on the surviving part
5. The questions left are the residual. advisor attaches a hypothesis plus reversibility / blast-radius to each, and only the irreversible or high-impact ones go to AskUserQuestion. Cap 7 questions. Proceed on the hypothesis as an assumption for the rest, and keep those residuals and every question delegated to subagents in the Why

### Input to Phase 2

Aggregate the Phase 1 findings into the following shape before spawning.

| Field            | Source                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| approach         | one-line summary of the proposal core                                                                                              |
| decisions        | settled architecture-level decisions, excluding terminology checks and scope minutiae                                              |
| trade-offs       | surfaced trade-offs                                                                                                                |
| referenced_files | files read                                                                                                                         |
| outcome_ref      | OUTCOME.md path plus a digest of its Behavior / Non-goals / Constraints. If OUTCOME.md is absent, the outcome confirmed in Phase 1 |

## Phase 2 Devil

Land the Phase 1 material on two critic-design, adversarially probing for holes.

| Pass                     | Role                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------- |
| critic-design (internal) | Attack the proposal on its own terms, surfacing hidden weaknesses and failure paths |
| critic-design (outcome)  | Attack the outcome fit and non-goal / constraint breaches                           |

1. Spawn two critic-design via Task in parallel. subagent_type is critic-design, run_in_background is false. One handles the internal attack, the other takes `outcome_ref` for the outcome attack. Omit the outcome attack when no outcome is available. Mention `ARCHITECTURE.md` if present. Include the target title verbatim in each spawn prompt. Each returns what its agent definition specifies: verdict (confirmed / weakened / needs_revision) and weaknesses (items carrying viewpoint, severity, finding, evidence, disconfirming probe)
2. Wait for both, reconcile the weaknesses, and drop the overlap. needs_revision from either pass means NO-GO, confirmed from both means GO, and anything else is a conditional GO whose condition rides on the Verdict line
3. Aggregate the overall verdict and the Phase 1 residuals into VERDICT_SCHEMA `{ verdict, assumptions: [{ text, irreversible, underspecified }] }`. When an irreversible assumption remains, assumptions exceed 7, or an assumption is underspecified, downgrade to NO-GO regardless of how good the content looks, and never hand-override it back to GO

## Output

| Section          | Content                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Verdict          | One GO / NO-GO line. Note the condition if conditional, and the reason if downgraded                                    |
| Why              | Fact-verification results, the two critic-design verdicts, and every residual advanced on assumption with reversibility |
| Actionable items | Top 3 concrete actions of keep / remove / revise                                                                        |
