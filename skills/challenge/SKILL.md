---
name: challenge
description: Two-phase challenge that judges whether a discovered problem is real and whether a proposed idea is usable. Phase 1 loops subagent verification and advisor judgment over evidence (OUTCOME.md + parallel subagents) to self-resolve design-tree branches. It asks the user only the irreversible branches that remain and proceeds on stated assumptions for the rest. Phase 2 spawns two critic-design subagents (internal attack / OUTCOME.md attack) as devil's advocate input. The verdict leads the output as a simple GO / NO-GO. Do NOT use for code review findings (use /audit) or outcome assertion (use /assert which has built-in adversarial testing).
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

Verify the proposal from evidence, then return only the unsettled questions to the user.

### Step 1: Settle the questions with evidence

Every judgment below is decided by the table, never by advisor confidence.

| Subject               | Condition                                                                                                | Treatment when it holds                     | Treatment when it does not                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| A question            | Evidence settles it to one answer. One needing a choice, such as priority or scope, does not settle      | subagents verify its answer in parallel     | Send it unverified to the unsettled pile                                         |
| A verified fact       | The targeted state already holds, or it contradicts the proposal. advisor opinion alone does not meet it | Skip Phase 2 and put the grounds in the Why | Proceed on the claims that still hold                                            |
| An unsettled question | It is irreversible or high-impact                                                                        | Ask it via AskUserQuestion. Cap 7 questions | Proceed on the advisor hypothesis as an assumption, and keep them all in the Why |

1. Read `.claude/OUTCOME.md`. If absent, infer the outcome from $ARGUMENTS and the conversation and confirm it via AskUserQuestion. The Phase 2 outcome attack uses it as its evaluation axis, so settle it rather than leaving it out
2. List the open questions in the proposal and sort them by the table
3. Run the verification loop. subagents verify the answers in parallel while advisor re-checks the sorting and names the next evidence
4. Break when more evidence no longer changes the sorting. Cap 3 rounds. Send whatever the loop left unsettled to the unsettled pile
5. Apply the table to the verified facts. When the treatment skips Phase 2, drop straight to the Output
6. Have advisor attach a hypothesis plus reversibility and blast-radius to each unsettled question, then route them by the table

### Step 2: Build the handoff

Aggregate the Step 1 findings into the shape below. Phase 2 takes this and nothing else as its input.

| Field            | Source                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| approach         | one-line summary of what the proposal does                                                                                          |
| decisions        | settled architecture-level decisions, excluding terminology checks and scope minutiae                                               |
| trade-offs       | surfaced trade-offs                                                                                                                 |
| referenced_files | files read                                                                                                                          |
| outcome_ref      | `.claude/OUTCOME.md` path plus a digest of its Behavior / Non-goals / Constraints. If it is absent, the outcome confirmed in Step 1 |

## Phase 2: Devil

Land the handoff on two critic-design, adversarially probing for holes.

### Step 1: Spawn the two

Both spawn prompts carry the target title, the handoff, and the path of a design document like `ARCHITECTURE.md`. Omit the outcome Pass when no outcome is available. The table below decides what differs per Pass.

| Pass                     | Target of the attack                           | Extra input   |
| ------------------------ | ---------------------------------------------- | ------------- |
| critic-design (internal) | The proposal itself                            | None          |
| critic-design (outcome)  | Outcome fit and non-goal / constraint breaches | `outcome_ref` |

1. Spawn two critic-design via Agent in parallel. subagent_type is critic-design
2. Wait for both. Each returns what its agent definition specifies: verdict (confirmed / weakened / needs_revision) and weaknesses (items carrying viewpoint, severity, finding, evidence, disconfirming probe)

### Step 2: Reach the verdict

Reconcile the weaknesses, drop the overlap, and aggregate the assumptions into VERDICT_SCHEMA `{ verdict, assumptions: [{ text, irreversible, underspecified }] }`. Apply the table below top to bottom and take the verdict of the first row that matches.

| Condition                                                                         | Verdict                             |
| --------------------------------------------------------------------------------- | ----------------------------------- |
| An `irreversible` or `underspecified` assumption remains, or assumptions exceed 7 | NO-GO. Never hand-override it to GO |
| Either pass returned needs_revision                                               | NO-GO                               |
| Both passes returned confirmed                                                    | GO                                  |
| Anything else                                                                     | Conditional GO                      |

## Output

| Section          | Content                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Verdict          | One GO / NO-GO line. Note what must hold on a conditional GO, and which verdict-table row matched on a NO-GO                      |
| Why              | Fact-verification results, the two critic-design verdicts, and every unsettled question advanced on assumption with reversibility |
| Actionable items | Top 3 concrete actions of keep / remove / revise                                                                                  |
