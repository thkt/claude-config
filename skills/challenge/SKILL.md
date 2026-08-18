---
name: challenge
description: Two-phase challenge that judges whether a discovered problem is real and whether a proposed idea is usable. Phase 1 loops subagent verification and advisor judgment over evidence (OUTCOME.md + parallel subagents) to self-resolve design-tree branches. It asks the user only the irreversible residual and proceeds on stated assumptions for the rest. Phase 2 spawns two critic-design subagents (internal attack / OUTCOME.md attack) as devil's advocate input. The verdict leads the output as a simple GO / NO-GO. Do NOT use for code review findings (use /audit) or outcome assertion (use /assert which has built-in adversarial testing).
when_to_use: devils advocate, 反論, チャレンジ, challenge, 叩いて, 穴探し, grill me, 壁打ち
allowed-tools: Read LS Agent AskUserQuestion
model: opus
argument-hint: "[proposal file | description]"
---

# /challenge - GO / NO-GO verdict on a proposal

Judge the proposal in two phases, so the next decision starts from a verified GO / NO-GO.

## Input

`$ARGUMENTS` carries the target. It may be a proposal file path or a description. If empty, stop and ask the user to specify the target; do not infer it from the conversation. When multi-line, the first line is the target title.

## Phase 1: Grill

Grill the proposal from evidence on its own, then return only the unresolved residual to the user. The table below decides how each question and each residual is handled.

| Condition                                                          | Treatment                                                                                                 |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| A question evidence settles to one answer                          | A fact. Send it to subagent verification                                                                  |
| A question needing a choice, such as priority / scope / trade-offs | A preference. Send it to the residual. Do not sort by advisor confidence                                  |
| The targeted state already holds, or a fact contradicts it         | The core is overturned. Skip Phase 2 and put the grounds in the Why. Do not stop on advisor opinion alone |
| Only a sub-claim conflicts with a fact                             | Proceed on the surviving part                                                                             |
| A residual is irreversible or high-impact                          | Ask it via AskUserQuestion. Cap 7 questions                                                               |
| Every other residual                                               | Proceed on the advisor hypothesis as an assumption, and keep them all in the Why                          |

1. Read `.claude/OUTCOME.md`. If absent, infer the outcome from $ARGUMENTS and the conversation and confirm it via AskUserQuestion
2. List the open questions in the proposal and sort them into facts and preferences
3. Run the verification loop. subagents check facts in parallel while advisor re-checks the sorting and names the next evidence
4. Break when more evidence no longer changes the sorting. Cap 3 rounds
5. Apply the table to the verified facts, and skip Phase 2 if the core is overturned
6. Take the unsettled questions as the residual, and have advisor attach a hypothesis plus reversibility / blast-radius to each
7. Route each residual by the table

## Handoff

Aggregate the Phase 1 findings into the following shape before spawning Phase 2.

| Field            | Source                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| approach         | one-line summary of the proposal core                                                                                                |
| decisions        | settled architecture-level decisions, excluding terminology checks and scope minutiae                                                |
| trade-offs       | surfaced trade-offs                                                                                                                  |
| referenced_files | files read                                                                                                                           |
| outcome_ref      | `.claude/OUTCOME.md` path plus a digest of its Behavior / Non-goals / Constraints. If it is absent, the outcome confirmed in Phase 1 |

## Phase 2: Devil

Land the Phase 1 material on two critic-design, adversarially probing for holes.

### Step 1: Spawn the two

The table below decides what each Pass attacks. Omit the outcome Pass when no outcome is available.

| Pass                     | Target of the attack                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| critic-design (internal) | The proposal on its own terms. Surface hidden weaknesses and failure paths |
| critic-design (outcome)  | Outcome fit and non-goal / constraint breaches                             |

1. Spawn two critic-design via Agent in parallel. subagent_type is critic-design
2. Include the target title verbatim in each spawn prompt, and hand `outcome_ref` to the outcome Pass
3. Put the path of any design document (`ARCHITECTURE.md` and the like, not limited to it) into both spawn prompts
4. Wait for both. Each returns what its agent definition specifies: verdict (confirmed / weakened / needs_revision) and weaknesses (items carrying viewpoint, severity, finding, evidence, disconfirming probe)

### Step 2: Reach the verdict

Reconcile the weaknesses, drop the overlap, and aggregate the assumptions into VERDICT_SCHEMA `{ verdict, assumptions: [{ text, irreversible, underspecified }] }`. Apply the table below top to bottom and take the first treatment that matches.

| Condition                                                                         | Treatment                                                                         |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| An `irreversible` or `underspecified` assumption remains, or assumptions exceed 7 | NO-GO. Never hand-override it back to GO, whatever verdict critic-design returned |
| Either pass returned needs_revision                                               | NO-GO                                                                             |
| Both passes returned confirmed                                                    | GO                                                                                |
| Anything else                                                                     | Conditional GO, with the condition riding on the Verdict line                     |

## Output

| Section          | Content                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Verdict          | One GO / NO-GO line. Note the condition on a conditional GO, and the matched condition on a NO-GO                       |
| Why              | Fact-verification results, the two critic-design verdicts, and every residual advanced on assumption with reversibility |
| Actionable items | Top 3 concrete actions of keep / remove / revise                                                                        |
