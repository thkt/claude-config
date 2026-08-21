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

const here = dirname(fileURLToPath(import.meta.url));
const assertJs = join(here, "..", "..", "assert.js");

// The bootstrap return value that makes dynamicOk true (worktree_ok true / install ok / build
// pass).
const bootOk = {
  codex_available: true,
  mode: "target",
  diff_kind: "",
  scope_files: ["src/foo.js"],
  outcome: "absent",
  worktree_ok: true,
  worktree_path: "/tmp/assert-wt",
  install: "ok",
  build: "pass",
  reason: "",
};

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

// U-001: a human reading a NotReady result can tell the stop was the issue count, not severity
// or disposition. gate_reason is assembled at the same site as the gate branch (the script,
// not an agent), listing the conditions that held. The gate branch itself is unchanged; only
// gate_reason is new on the return value.
//
// T-002 wants a run where both build and tests are non-passing. The gate script's own dynamicOk
// gate (buildCol === "fail" => dynamicOk false => the test-exec agent is never invoked, so
// testsCol can only land on "skipped") makes a literal simultaneous build:"fail" /
// tests:"fail" unreachable through a real run: a failed build always skips the test stage
// rather than failing it. boot.build: "fail" is the closest reachable state (buildCol "fail",
// testsCol forced to "skipped"), and it already NotReady's the gate on build alone, which is
// what this scenario needs: a non-issue cause with zero issues.
// T-001 and T-002 differ only in which stage return values they need to override (boot for
// T-002's failed build, issues for T-001's issue count); the rest of the label dispatch is
// shared, so one factory takes both as overrides instead of duplicating it per test.
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

test("T-001 issue が 1 件以上あるだけで NotReady になった run の gate_reason に issue の件数が入る", async () => {
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

test("T-002 build と tests が fail で issue が 0 件の run の gate_reason に issue の件数が入らない", async () => {
  const failBoot = { ...bootOk, build: "fail" };
  // test-exec / adversarial are never invoked once build fails (dynamicOk gates them off);
  // makeGateReasonAgent still stubs them, but the workflow never reaches those branches.
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
