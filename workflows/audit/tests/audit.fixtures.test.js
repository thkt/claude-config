// The tests that consume _fixtures.js watch audit.js's behavior, and none of them watch the
// fixture itself. Breaking the override of a default would leave every consuming test green,
// so these cases pin it here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";
import { defaultAgentStub, callOf, snapshotPayload } from "./_fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");

const BOTH_CONFIRMED = {
  verdicts: [
    { id: "R-1", verdict: "confirmed" },
    { id: "R-2", verdict: "confirmed" },
  ],
};

const INTEGRATED = {
  findings: [{ file: "sample.js", line: "1", severity: "high", summary: "integrated finding" }],
};

const run = (overrides) =>
  runWorkflow(auditJs, {
    args: { focus: "security", skipPreflight: true },
    stubs: { agent: defaultAgentStub(overrides) },
  });

test("the default stub returns findings carrying R-1 for security and R-2 for silence", async () => {
  const { calls } = await run({ challenge: BOTH_CONFIRMED, integrate: INTEGRATED });

  const payload = snapshotPayload(calls);
  assert.ok(payload, "the payload is readable from the snapshot prompt");
  const byReviewer = Object.fromEntries(payload.raw_findings.map((f) => [f.reviewer, f.id]));
  assert.equal(byReviewer.security, "R-1", "the security finding carries R-1");
  assert.equal(byReviewer.silence, "R-2", "the silence finding carries R-2");
});

test("a response passed by the caller wins over the default", async () => {
  // The default challenge (unspecified) is undefined and fails open, so every finding without a
  // verdict enters survivors as confirmed. Here the caller passes disputed for both, overriding
  // that default, and survivors comes back empty.
  const { result } = await run({
    challenge: {
      verdicts: [
        { id: "R-1", verdict: "disputed" },
        { id: "R-2", verdict: "disputed" },
      ],
    },
    integrate: INTEGRATED,
  });

  assert.deepEqual(
    result.survivors,
    [],
    "the caller's disputed response wins over the fail-open default and empties survivors",
  );
});

test("a stage given no key differs from a stage given an explicit undefined", async () => {
  const { result: notPassed } = await run({ challenge: BOTH_CONFIRMED, integrate: INTEGRATED });
  assert.equal(
    notPassed.verify_ran,
    true,
    "a stage given no verify key returns the default output and verify_ran is true",
  );

  const { result: explicitUndefined } = await run({
    challenge: BOTH_CONFIRMED,
    integrate: INTEGRATED,
    verify: undefined,
  });
  assert.equal(
    explicitUndefined.verify_ran,
    false,
    "a stage given verify: undefined returns no output and verify_ran is false",
  );
});

// This pins callOf's own behavior. The three cases above reach it only indirectly through
// snapshotPayload and agentStub, so its direct result is checked here.
test("callOf finds the call carrying the given label in calls.agent", async () => {
  const { calls } = await run({ challenge: BOTH_CONFIRMED, integrate: INTEGRATED });
  const challengeCall = callOf(calls, "challenge");
  assert.ok(challengeCall, "callOf found the challenge stage call");
  assert.equal(challengeCall.opts.label, "challenge");
});
