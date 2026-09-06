// Turning still_open into reopened is a script-side decision rather than an agent one, so it is
// pinned here as external behavior that the fix agent's self-report cannot sway.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.ts";

const here = dirname(fileURLToPath(import.meta.url));
const polishJs = join(here, "..", "..", "polish.js");

// The shortest stub carrying the run to Cleanup. Only the challenge verdicts and the rejudge
// return value vary.
const agentStub = ({ diffKind = "uncommitted", challenge, rejudge } = {}) => {
  const stub = (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "codex") {
      return {
        available: true,
        has_changes: true,
        diff_kind: diffKind,
        findings: [
          { id: "F1", title: "finding title", detail: "finding detail", severity: "P1" },
          { id: "F2", title: "other title", detail: "other detail", severity: "P2" },
        ],
      };
    }
    if (label === "challenge") {
      return (
        challenge || {
          verdicts: [
            { id: "F1", verdict: "confirmed" },
            { id: "F2", verdict: "confirmed" },
          ],
        }
      );
    }
    if (label === "fix") {
      return { fixed: ["F1 fixed", "F2 fixed"], stashed: [], tests_pass: true };
    }
    if (label === "rejudge") {
      return rejudge;
    }
    if (label === "validate") {
      return { edits: [], tests_pass: true, stashed: false };
    }
    return undefined;
  };
  return stub;
};

const bothResolved = {
  verdicts: [
    { id: "F1", verdict: "resolved" },
    { id: "F2", verdict: "resolved" },
  ],
};

const callOf = (calls, label) => calls.agent.find((c) => c.opts && c.opts.label === label);

test("T-001 hands the rejudge agent the survivor list and the post-fix diff to re-judge against", async () => {
  const uncommitted = await runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo" },
    stubs: { agent: agentStub({ diffKind: "uncommitted", rejudge: bothResolved }) },
  });
  const call = callOf(uncommitted.calls, "rejudge");
  assert.ok(call, "the rejudge agent started");
  assert.equal(call.opts.agentType, "critic-audit", "critic-audit does the re-judging");
  assert.match(call.prompt, /"id":"F1"/, "the survivor list rides the prompt");
  assert.match(call.prompt, /"id":"F2"/, "the survivor list rides the prompt");
  assert.match(call.prompt, /git diff HEAD/, "an uncommitted post-fix diff is git diff HEAD");
  assert.deepEqual(
    call.opts.schema.properties.verdicts.items.properties.verdict.enum,
    ["resolved", "still_open"],
    "the verdict takes the two values resolved and still_open",
  );

  const branch = await runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo" },
    stubs: { agent: agentStub({ diffKind: "branch", rejudge: bothResolved }) },
  });
  assert.match(
    callOf(branch.calls, "rejudge").prompt,
    /git diff main(?!\.)/,
    "a branch post-fix diff is the two-dot diff of base against the working tree, since the fix is not committed",
  );
});

test("T-002 lists a finding judged still_open under reopened with its id and severity", async () => {
  const { result } = await runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo" },
    stubs: {
      agent: agentStub({
        rejudge: {
          verdicts: [
            { id: "F1", verdict: "resolved" },
            { id: "F2", verdict: "still_open", why: "no matching change in the diff" },
          ],
        },
      }),
    },
  });
  assert.deepEqual(result.reopened, [
    { id: "F2", severity: "P2", why: "no matching change in the diff" },
  ]);
  assert.equal(result.rejudge_notes, "", "a run that could judge carries no notes");
});

test("T-002b lists a survivor missing a verdict under reopened as still_open", async () => {
  const { result } = await runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo" },
    stubs: {
      agent: agentStub({ rejudge: { verdicts: [{ id: "F1", verdict: "resolved" }] } }),
    },
  });
  assert.deepEqual(
    result.reopened.map((r) => r.id),
    ["F2"],
    "a survivor dropped from the verdicts does not flow through as resolved",
  );
});

test("T-003 sets reopened to null with a reason when the rejudge agent returns nothing", async () => {
  const { result } = await runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo" },
    stubs: { agent: agentStub({ rejudge: undefined }) },
  });
  assert.equal(result.reopened, null, "an unjudged run must not read as zero reopened");
  assert.match(result.rejudge_notes, /rejudge/, "the reason it went unjudged is attached");
});

test("T-004 does not start the rejudge agent when there is no survivor", async () => {
  const { calls, result } = await runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo" },
    stubs: {
      agent: agentStub({
        challenge: {
          verdicts: [
            { id: "F1", verdict: "disputed" },
            { id: "F2", verdict: "disputed" },
          ],
        },
      }),
    },
  });
  assert.equal(result.survivors, 0);
  assert.equal(callOf(calls, "rejudge"), undefined);
  assert.deepEqual(result.reopened, [], "reopened is an empty array when the agent never starts");
});

test("T-005 does not start the rejudge agent in mode review", async () => {
  const { calls, result } = await runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo", mode: "review" },
    stubs: { agent: agentStub({ rejudge: bothResolved }) },
  });
  assert.equal(callOf(calls, "rejudge"), undefined);
  assert.equal(result.reopened, undefined, "the review return value carries no reopened");
});
