// The assert workflow records an adversarial stage stall in result.adversarial. The structural
// tokens are identical between the EN and the .ja version, so these cases inspect only those
// tokens rather than the localized prose.
//
// The stall marker is a string field appearing only when a stall happened. Making it an
// always-present boolean such as `stall: false` would break the negative assertion that checks
// the field is absent on a genuine no-tests run.
//
// The adversarial stage is one agent for the whole run rather than per target, so telling the
// two apart means running the workflow twice (stall and genuine no-tests) and comparing. The
// bootstrap returns worktree_ok / install ok / build pass to make dynamicOk true, so the
// adversarial agent really runs and its null return means an agent stall rather than an env
// skip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";
import { bootOk, recordCallsOf, recordPayloadOf } from "./_fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const assertJs = join(here, "..", "..", "assert.js");

// The shortest agent stub carrying every stage but adversarial. advReturn is injected as the
// adversarial stage's return value (null = stall, { ran: true, tests: [] } = genuine no-tests).
const makeAgent = (advReturn) => (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "bootstrap") return bootOk;
  if (label === "test-exec") return { outcome: "pass", passed: 1, failed: 0 };
  if (label === "adversarial") return advReturn;
  if (label === "codex-review") return { ran: true, findings: [] };
  if (label === "synthesize") return { issues: [], root_causes: [], report: "ok" };
  if (label === "cleanup") return {};
  return undefined;
};

test("result.adversarial shows a stall distinct from zero tests when the adversarial agent returns null", async () => {
  const stallRun = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeAgent(null) }, // adversarial agent stall
  });
  const zeroRun = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeAgent({ ran: true, tests: [] }) }, // alive, zero tests
  });

  const stallAdv = stallRun.result && stallRun.result.adversarial;
  const zeroAdv = zeroRun.result && zeroRun.result.adversarial;
  assert.ok(stallAdv, "result.adversarial comes back on a stall too");
  assert.ok(zeroAdv, "result.adversarial comes back on genuine no-tests too");

  const stallText = JSON.stringify(stallAdv);
  const zeroText = JSON.stringify(zeroAdv);

  assert.ok(
    /stall|no output/i.test(stallText),
    "a stalled adversarial agent records a stall marker in result.adversarial",
  );
  assert.ok(
    !/stall|no output/i.test(zeroText),
    "genuine no-tests carries no stall marker, keeping a stall and zero tests apart",
  );
});

test("result.adversarial shows the stage as not run with a diagnostic reason when the agent self-reports ran: false", async () => {
  const selfSkipRun = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeAgent({ ran: false, tests: [], notes: "sandbox denied codex exec" }) },
  });
  const adv = selfSkipRun.result && selfSkipRun.result.adversarial;
  assert.ok(adv, "result.adversarial comes back on a self-reported skip too");
  assert.equal(
    adv.stall,
    "not run: sandbox denied codex exec",
    "a self-reported skip is recorded with its diagnostic notes, distinct from an agent with no output",
  );
});

test("result.adversarial shows a stall distinct from zero tests when the triage block throws", async () => {
  // testRunP and adversarialP already carry .catch(() => null) on the agent side, so
  // reproducing a block throw uses the triage verdict agent (label "triage:*"), which is
  // awaited through parallel with no catch. The harness's parallel rejects when a thunk throws,
  // so the IIFE throws as a whole and the outer .catch(() => null) folds triageRes to null.
  // This pins that the stall marker survives in the summary for that entire throw class.
  const failTest = {
    test_name: "t1",
    target: "src/foo.js:3",
    assertion: "x",
    result: "FAIL",
    failure_detail: "boom",
  };
  const throwingAgent = (prompt, opts) => {
    const label = opts && opts.label;
    if (label && label.startsWith("triage:")) throw new Error("triage agent crashed");
    return makeAgent({ ran: true, tests: [failTest] })(prompt, opts);
  };
  const thrownRun = await runWorkflow(assertJs, { args: {}, stubs: { agent: throwingAgent } });
  const adv = thrownRun.result && thrownRun.result.adversarial;
  assert.ok(adv, "result.adversarial comes back on a throw too");
  assert.equal(
    adv.stall,
    "triage stage threw / no output",
    "a throw in the triage block is recorded as a stall, distinct from a clean zero",
  );
});

// U-002: on a run where the nested workflow("audit") failed open (challenge_ran=false), the
// audit findings are not called critic-verified and the gate does not reach Ready.

// Only challenge_ran varies; both cases carry one finding. The combination with zero findings
// is covered separately by T-009.
const makeAuditWorkflowStub = (challengeRan) => (name) =>
  name === "audit"
    ? {
        findings: [{ file: "a.js", line: 5, severity: "high", summary: "audit finding" }],
        challenge_ran: challengeRan,
        verify_ran: challengeRan,
      }
    : undefined;

// The synthesize agent is called exactly once per run.
const synthesizePromptOf = (calls) => {
  const call = calls.agent.find((c) => c.opts && c.opts.label === "synthesize");
  return (call && call.prompt) || "";
};

test("T-004 the Synthesize prompt does not call audit findings critic-verified when audit returns challenge_ran=false", async () => {
  const { calls } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: makeAuditWorkflowStub(false),
    },
  });
  const prompt = synthesizePromptOf(calls);
  assert.ok(prompt.length > 0, "the synthesize agent ran");
  assert.ok(
    !/critic-verified/i.test(prompt),
    "a run where audit's challenge failed open (challenge_ran=false) does not call its findings critic-verified",
  );
});

test("T-005 the wording is unchanged when audit returns challenge_ran=true", async () => {
  const { calls } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: makeAuditWorkflowStub(true),
    },
  });
  const prompt = synthesizePromptOf(calls);
  assert.ok(prompt.length > 0, "the synthesize agent ran");
  assert.ok(
    /critic-verified/i.test(prompt),
    "a run where audit's challenge ran normally (challenge_ran=true) keeps the existing critic-verified wording",
  );
});

test("T-006 the gate becomes Ready (caveat) rather than Ready when audit returns challenge_ran=false with zero issues", async () => {
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: makeAuditWorkflowStub(false),
    },
  });
  assert.equal(
    result.gate,
    "Ready (caveat)",
    "a run where audit failed open reaches Ready (caveat) rather than Ready even with zero issues",
  );
});

test("T-007 the gate stays Ready when audit returns challenge_ran=true with zero issues and passing tests", async () => {
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: makeAuditWorkflowStub(true),
    },
  });
  assert.equal(
    result.gate,
    "Ready",
    "a run where audit's challenge ran normally stays Ready with zero issues and passing tests",
  );
});

test("T-009 the gate becomes Ready (caveat) rather than Ready when audit returns zero findings and challenge_ran=false", async () => {
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: (name) =>
        name === "audit" ? { findings: [], challenge_ran: false, verify_ran: false } : undefined,
    },
  });
  assert.equal(
    result.gate,
    "Ready (caveat)",
    "a run where no reviewer produced anything and challenge never ran does not reach Ready even with zero issues",
  );
});

// U-003: assert, having actually received the audit workflow's return value, reflects the
// degradation in its gate. T-008 does not replace workflow("audit") with a hand-written object;
// it really runs audit.js nested. What is under test is the connection from audit's return
// value to assert's gate calculation, so no inner layer is stubbed (the seam unit contract).
const auditJs = join(here, "..", "..", "audit.js");

// The minimum response for each audit.js stage label. Only the challenge stage stays silent, so
// audit.js itself computes challenge_ran=false alongside non-empty findings.
const auditAgentStub = (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "route") return { files: [{ path: "a.js", churn: 0 }] };
  if (label === "security")
    return { findings: [{ file: "a.js", line: 5, severity: "high", summary: "issue" }] };
  if (label === "verify") return "verified: execution path confirmed";
  if (label === "integrate")
    return {
      findings: [
        { file: "a.js", line: 5, severity: "high", summary: "issue", source_ids: ["R-1"] },
      ],
    };
  // "challenge" (audit.js's own challenge stage), "snapshot", and the other reviewer labels
  // deliberately return nothing.
  return undefined;
};

// Replaces assert.js's workflow("audit", wfArgs) with a form that really runs audit.js nested.
const runRealAudit = async (name, wfArgs) => {
  if (name !== "audit") return undefined;
  const { result } = await runWorkflow(auditJs, {
    args: wfArgs,
    stubs: { agent: auditAgentStub },
  });
  return result;
};

test("T-008 assert running a nested audit with no challenge stub receives challenge_ran=false and keeps the gate off Ready", async () => {
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: makeAgent({ ran: true, tests: [] }),
      workflow: runRealAudit,
    },
  });
  assert.equal(
    result.gate,
    "Ready (caveat)",
    "a run that really nested audit and saw its challenge fail open (challenge_ran=false) lands on gate Ready (caveat)",
  );
});

// The gate branch itself is unchanged; only gate_reason is new on the return value.
//
// T-002's literal state, build and tests both failing, is unreachable: buildCol === "fail"
// forces dynamicOk false, so the test-exec agent never runs and testsCol can only be "skipped".
// boot.build: "fail" is the closest reachable state, and it already gates NotReady on build
// alone, which is what the case needs: a non-issue cause with zero issues.
const makeGateReasonAgent =
  ({ boot = bootOk, issues = [] } = {}) =>
  (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "bootstrap") return boot;
    if (label === "test-exec") return { outcome: "pass", passed: 1, failed: 0 };
    if (label === "adversarial") return { ran: true, tests: [] };
    if (label === "codex-review") return { ran: true, findings: [] };
    if (label === "synthesize") return { issues, root_causes: [], report: "ok" };
    if (label === "cleanup") return {};
    return undefined;
  };

test("T-001 a run gated NotReady by issues alone carries the issue count in gate_reason", async () => {
  const issues = [
    { file: "a.js", line: 10, severity: "high", summary: "x", source: ["audit"] },
    { file: "b.js", line: 20, severity: "medium", summary: "y", source: ["audit"] },
  ];
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeGateReasonAgent({ issues }) },
  });
  assert.equal(
    result.gate,
    "NotReady",
    "build passes and tests pass, so issues alone gate NotReady",
  );
  assert.ok(
    result.gate_reason !== undefined,
    "gate_reason is present on the return value alongside gate",
  );
  const reasonText = JSON.stringify(result.gate_reason);
  assert.match(
    reasonText,
    /issue/i,
    "gate_reason names the issue condition as one of the conditions that held",
  );
  assert.match(
    reasonText,
    new RegExp(`\\b${issues.length}\\b`),
    "gate_reason carries the issue count (2), not just the word issue",
  );
});

test("T-002 a run gated with zero issues names no issue count in gate_reason", async () => {
  const failBoot = { ...bootOk, build: "fail" };
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeGateReasonAgent({ boot: failBoot }) },
  });
  assert.equal(result.gate, "NotReady", "a failed build gates NotReady with zero issues");
  assert.ok(
    result.gate_reason !== undefined,
    "gate_reason is present on the return value alongside gate",
  );
  const reasonText = JSON.stringify(result.gate_reason);
  assert.ok(
    !/issue/i.test(reasonText),
    "with zero issues the issue condition never held, so gate_reason names build/tests only",
  );
});

// A repository with no build concept reaches Ready with buildCol "skipped" (install ok + build
// skipped keeps envFail false). A hardcoded "build pass" would contradict the sibling `build`.
test("T-003 a Ready run whose build was skipped does not report build as passing", async () => {
  const skippedBoot = { ...bootOk, build: "skipped" };
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeGateReasonAgent({ boot: skippedBoot }) },
  });
  assert.equal(result.gate, "Ready", "no build concept and passing tests still reach Ready");
  assert.equal(result.build, "skipped", "the build column reports what bootstrap returned");
  const reasonText = JSON.stringify(result.gate_reason);
  assert.ok(
    !/build pass/.test(reasonText),
    "gate_reason does not claim a build that never ran passed",
  );
  assert.match(reasonText, /build skipped/, "gate_reason reports the build column it read");
});

// U-001: mergeIssues's `if (!sev) continue;` branch drops a finding whose severity SEVERITY_MAP
// maps to null (P3) or does not carry at all (unknown severity), and up to now that drop left no
// trace on the return value (WORKFLOWS.md § Degradation recording: loss granularity). The count
// of findings dropped this way is read off the workflow's own return value (result.dropped),
// since mergeIssues is a function local to the vm-evaluated script body and is not otherwise
// observable from a test (see run-workflow.js's header comment on script evaluation).
test("T-010 a finding whose severity is not in SEVERITY_MAP stays out of issues and is counted as dropped", async () => {
  const droppedFinding = {
    file: "a.js",
    line: 10,
    severity: "P4",
    summary: "unrecognised severity",
    source: ["audit"],
  };
  const keptFinding = {
    file: "b.js",
    line: 20,
    severity: "high",
    summary: "recognised severity",
    source: ["audit"],
  };
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeGateReasonAgent({ issues: [droppedFinding, keptFinding] }) },
  });
  assert.equal(result.issues.length, 1, "only the recognised-severity finding reaches issues");
  assert.ok(
    !result.issues.some((i) => i.file === "a.js" && i.line === 10),
    "the finding with an unrecognised severity (P4) stays out of issues",
  );
  assert.equal(
    result.dropped,
    1,
    "the finding dropped for its unrecognised severity is counted on the return value",
  );
});

test("T-011 a run whose findings all carry a recognised severity reports zero dropped findings", async () => {
  const issues = [
    { file: "a.js", line: 10, severity: "high", summary: "x", source: ["audit"] },
    { file: "b.js", line: 20, severity: "medium", summary: "y", source: ["audit"] },
  ];
  const { result } = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeGateReasonAgent({ issues }) },
  });
  assert.equal(result.issues.length, 2, "both recognised-severity findings reach issues");
  assert.equal(
    result.dropped,
    0,
    "a run whose findings all carry a recognised severity reports zero dropped findings",
  );
});

// U-003: assert records one row per settled run in $HOME/.claude/history/assert-runs.jsonl,
// following build.js's recordRun (workflows/assert/record.py already accepts arbitrary payload
// keys, so this unit only wires assert.js to build that payload and hand it to the agent that
// runs the recorder). A failed record must not stop the run (WORKFLOWS.md § Degradation
// recording), so a recorder returning nothing still lets the gate reach its own return value,
// with the loss surfaced through log() instead.

test("T-012 a run that reaches a gate writes one row carrying that gate and the per-severity issue counts", async () => {
  const issues = [
    { file: "a.js", line: 10, severity: "high", summary: "x", source: ["audit"] },
    { file: "b.js", line: 20, severity: "medium", summary: "y", source: ["audit"] },
    { file: "c.js", line: 30, severity: "high", summary: "z", source: ["audit"] },
  ];
  const { result, calls } = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeGateReasonAgent({ issues }) },
  });
  const records = recordCallsOf(calls);
  assert.equal(records.length, 1, "the run writes exactly one record row");
  const payload = recordPayloadOf(records[0]);
  assert.equal(payload.gate, result.gate, "the row carries the gate this run reached");
  assert.equal(
    payload.issue_counts && payload.issue_counts.high,
    2,
    "the row's issue_counts.high matches the two high-severity issues",
  );
  assert.equal(
    payload.issue_counts && payload.issue_counts.medium,
    1,
    "the row's issue_counts.medium matches the one medium-severity issue",
  );
});

test("T-013 a recorder returning nothing leaves the gate unchanged and names the unwritten row in log()", async () => {
  const { result, logs } = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: makeAgent({ ran: true, tests: [] }) }, // the "record" label falls through to undefined
  });
  assert.equal(
    result.gate,
    "Ready",
    "the gate this run computed from its own evidence is unchanged by a recorder that returns nothing",
  );
  assert.ok(
    logs.some((m) => /assert-runs\.jsonl/.test(m)),
    "the unwritten row reaches log() naming the file it is missing from",
  );
});

test("T-014 a throw inside the try still leaves a row for that run", async () => {
  const recordCalls = [];
  const throwingAgent = (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "codex-review") throw new Error("codex review crashed");
    if (label === "record") recordCalls.push(prompt);
    return makeAgent({ ran: true, tests: [] })(prompt, opts);
  };
  await assert.rejects(
    () => runWorkflow(assertJs, { args: {}, stubs: { agent: throwingAgent } }),
    /codex review crashed/,
    "the throw inside the try still propagates out of the workflow",
  );
  assert.equal(
    recordCalls.length,
    1,
    "the record row is written from a point the finally block reaches before the throw propagates",
  );
});

test("T-015 the row carries challenge_stalled and audit_degraded as booleans", async () => {
  const stalledAgent = (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "codex-review")
      return { ran: true, findings: [{ file: "a.js", line: 1, severity: "P1", summary: "x" }] };
    if (label === "challenge" || label === "verify") return undefined; // both stall
    return makeAgent({ ran: true, tests: [] })(prompt, opts);
  };
  const { calls } = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: stalledAgent, workflow: makeAuditWorkflowStub(false) },
  });
  const records = recordCallsOf(calls);
  assert.equal(records.length, 1, "the run writes exactly one record row");
  const payload = recordPayloadOf(records[0]);
  assert.equal(typeof payload.challenge_stalled, "boolean", "challenge_stalled is a boolean");
  assert.equal(typeof payload.audit_degraded, "boolean", "audit_degraded is a boolean");
  assert.equal(
    payload.challenge_stalled,
    true,
    "the Codex findings were unverified this run (challenge and verify both stalled)",
  );
  assert.equal(
    payload.audit_degraded,
    true,
    "the nested audit workflow's challenge stage failed open this run",
  );
});

// The Testing Decisions clause asks for both sides of the gate to leave a row. T-012 and T-016
// drive runs carrying issues, so only NotReady was covered.
test("T-016 a Ready-gated run appends exactly one record row", async () => {
  const { result, calls } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: (prompt, opts) => {
        if (opts && opts.label === "record")
          return { path: "/home/u/.claude/history/assert-runs.jsonl" };
        return makeAgent({ ran: true, tests: [] })(prompt, opts);
      },
    },
  });
  assert.equal(result.gate, "Ready", "no issues and passing evidence gate Ready");
  assert.equal(
    recordCallsOf(calls).length,
    1,
    "a Ready run writes one row, same as a NotReady run",
  );
});

// recordRun sits in the finally block, so a throw there replaces whatever the try block was
// throwing. A recorder failure must not stop the run, and must not mask the real one either.
test("T-017 a recorder that throws leaves the gate unchanged and names the unwritten row in log()", async () => {
  const { result, logs } = await runWorkflow(assertJs, {
    args: {},
    stubs: {
      agent: (prompt, opts) => {
        if (opts && opts.label === "record") throw new Error("recorder exploded");
        return makeAgent({ ran: true, tests: [] })(prompt, opts);
      },
    },
  });
  assert.equal(
    result.gate,
    "Ready",
    "a throwing recorder does not change the gate the run computed",
  );
  assert.ok(
    logs.some((m) => /assert-runs\.jsonl/.test(m)),
    "the unwritten row reaches log() naming the file it is missing from",
  );
});
