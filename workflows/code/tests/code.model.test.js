// An optional input.model reaches the Red / Green implementation agents only (defaulting to
// sonnet), and those agents always run at effort high.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkWorkflowSyntax, runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const codeJs = join(here, "..", "..", "code.js");

const plan = {
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "sample goal",
      files: ["sample.js"],
      contract: "sample contract",
      tests: [{ id: "T-001", name: "sample spec statement" }],
    },
  ],
};

const noTestPlan = {
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "docs goal",
      files: ["README.md"],
      contract: "docs contract",
      tests: [],
    },
  ],
};

// red / green fail on the first call, which is the only way red2 / green2 come to exist.
const retryingAgentStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label.startsWith("red2:"))
    return { red_confirmed: true, test_files: ["t.test.js"], notes: "" };
  if (label.startsWith("red:"))
    return {
      red_confirmed: false,
      test_files: [],
      notes: "passed unexpectedly",
    };
  if (label.startsWith("green2:")) return { green: true, notes: "" };
  if (label.startsWith("green:")) return { green: false, notes: "still failing" };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

const happyAgentStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label.startsWith("red:"))
    return { red_confirmed: true, test_files: ["t.test.js"], notes: "" };
  if (label.startsWith("green:")) return { green: true, notes: "" };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

test("propagates a given model to the 4 Red / Green calls and their retries while Verify stays sonnet", async () => {
  const { calls } = await runWorkflow(codeJs, {
    // A model distinct from Verify's fixed sonnet, so the assertions below can
    // tell input.model propagation apart from the fixed value.
    args: { plan, repo: "/abs/target-repo", model: "haiku" },
    stubs: { agent: retryingAgentStub },
  });

  const redGreen = calls.agent.filter((c) => /^(red|red2|green|green2):/.test(c.opts.label));
  assert.equal(redGreen.length, 4, "red / red2 / green / green2 calls are all present");
  for (const call of redGreen) {
    assert.equal(call.opts.model, "haiku", `${call.opts.label} opts carries model: "haiku"`);
    assert.equal(call.opts.effort, "high", `${call.opts.label} opts carries effort: "high"`);
  }

  const verify = calls.agent.find((c) => c.opts.label === "verify");
  assert.ok(verify, "verify call is present");
  assert.equal(
    verify.opts.model,
    "sonnet",
    "verify opts carries the fixed sonnet, not input.model",
  );
});

test("runs to completion with the default sonnet and effort high on Red / Green when no model is given", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo" },
    stubs: { agent: happyAgentStub },
  });

  for (const call of calls.agent) {
    if (call.opts.label === "verify") {
      assert.equal(call.opts.model, "sonnet", "verify opts carries the fixed sonnet");
      continue;
    }
    assert.equal(call.opts.model, "sonnet", `${call.opts.label} opts carries the default sonnet`);
    assert.equal(call.opts.effort, "high", `${call.opts.label} opts carries effort: "high"`);
  }
  assert.deepEqual(result.completed, ["U-1"], "completed contains the unit id");
  assert.equal(result.tests_pass, true, "verify tests_pass is returned as-is");
});

// Only a seam unit's test fails on a missing wire between two layers. Stubbing an inner layer
// erases what the unit means, so these cases pin that the prohibition rides the Red / Green
// prompts.
test("only a unit with seam: true carries the inner-layer stub ban and the wiring assert in its Red / Green prompts", async () => {
  const seamPlan = (seam) => ({
    test_command: "echo test",
    units: [{ ...plan.units[0], seam }],
  });

  const promptsFor = async (seam) => {
    const { calls } = await runWorkflow(codeJs, {
      args: { plan: seamPlan(seam), repo: "/abs/target-repo" },
      stubs: { agent: happyAgentStub },
    });
    return calls.agent
      .filter((c) => /^(red|green):/.test(c.opts.label))
      .map((c) => c.prompt)
      .join("\n");
  };

  const withSeam = await promptsFor(true);
  assert.match(withSeam, /seam unit/, "the prompt says the unit is a seam unit");
  assert.match(withSeam, /stub/, "the prompt carries the inner-layer stub ban");

  const withoutSeam = await promptsFor(false);
  assert.doesNotMatch(withoutSeam, /seam unit/, "a unit with seam: false carries no seam wording");
});

// Consulting the advisor mid-implementation clashes with build's design (a blocker is recorded
// as an anomaly and the run advances; heavy assurance is human-invoked on the draft PR), so
// these pin that the no-advisor constraint rides all three implementation prompts and not
// Verify's.
test("the direct impl, Red, and Green prompts carry the advisor ban and the anomaly routing while Verify does not", async () => {
  const directStub = (prompt, opts) => {
    const label = opts.label ?? "";
    if (label.startsWith("impl:")) return { green: true, notes: "" };
    if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
    throw new Error(`unexpected label: ${label}`);
  };
  const { calls: tddCalls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo" },
    stubs: { agent: happyAgentStub },
  });
  const { calls: directCalls } = await runWorkflow(codeJs, {
    args: { plan: noTestPlan, repo: "/abs/target-repo" },
    stubs: { agent: directStub },
  });

  const implementCalls = [...tddCalls.agent, ...directCalls.agent].filter((c) =>
    /^(red|green|impl):/.test(c.opts.label),
  );
  assert.equal(implementCalls.length, 3, "all three routes red / green / impl are present");
  for (const call of implementCalls) {
    assert.match(call.prompt, /advisor tool/, `${call.opts.label} carries the advisor ban`);
    assert.match(call.prompt, /anomaly/, `${call.opts.label} carries the anomaly routing`);
  }

  const verify = tddCalls.agent.find((c) => c.opts.label === "verify");
  assert.doesNotMatch(verify.prompt, /advisor/, "the Verify prompt carries no advisor constraint");
});

test("a unit with no tests skips Red / Green, completes in one direct impl step, and propagates model and effort", async () => {
  const directStub = (prompt, opts) => {
    const label = opts.label ?? "";
    if (label.startsWith("impl:")) return { green: true, notes: "" };
    if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
    throw new Error(`unexpected label: ${label}`);
  };
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: noTestPlan, repo: "/abs/target-repo", model: "haiku" },
    stubs: { agent: directStub },
  });

  const labels = calls.agent.map((c) => c.opts.label);
  assert.ok(
    labels.every((l) => !/^(red|red2|green|green2):/.test(l)),
    "no Red / Green agent runs",
  );
  const impl = calls.agent.find((c) => c.opts.label === "impl:U-1");
  assert.ok(impl, "the direct implementation agent impl:U-1 ran");
  assert.equal(impl.opts.model, "haiku", "input.model propagates to impl");
  assert.equal(impl.opts.effort, "high", "impl runs at effort high");
  assert.deepEqual(result.completed, ["U-1"], "the directly implemented unit lands in completed");
});

test("fails closed with stopped: unit-failed when the direct implementation fails twice", async () => {
  const failingStub = (prompt, opts) => {
    const label = opts.label ?? "";
    if (label.startsWith("impl2:")) return { green: false, notes: "still red" };
    if (label.startsWith("impl:")) return { green: false, notes: "suite failed" };
    throw new Error(`unexpected label: ${label}`);
  };
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: noTestPlan, repo: "/abs/target-repo" },
    stubs: { agent: failingStub },
  });
  assert.equal(result.stopped, "unit-failed", "not green after the retry means unit-failed");
  assert.ok(
    calls.agent.some((c) => c.opts.label === "impl2:U-1"),
    "the direct implementation retry (impl2) runs once",
  );
});

test("the static gates pass on the JA and EN code.js and on tests/*.js", () => {
  const scripts = [join(root, ".ja", "workflows", "code.js"), join(root, "workflows", "code.js")];
  const modules = [
    join(root, "workflows", "_lib", "run-workflow.js"),
    join(root, "workflows", "code", "tests", "code.model.test.js"),
  ];
  for (const file of scripts) {
    checkWorkflowSyntax(file);
  }
  for (const file of modules) {
    execFileSync("node", ["--check", file], { cwd: root });
  }
  execFileSync("npx", ["oxlint", ...scripts, ...modules], { cwd: root });
});

// verification tells the caller whether the suite verified anything or the gates carried the
// run alone. build.js derives the same claim from its own plan reading, so this pins the
// contract before that second derivation is retired in favour of this one.
const verificationStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label.startsWith("impl:")) return { green: true, notes: "", deferred: [] };
  if (label.startsWith("red:"))
    return { red_confirmed: true, test_files: ["a.test.js"], notes: "", evidence: [] };
  if (label.startsWith("green:")) return { green: true, notes: "", deferred: [] };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

const unitOf = (id, tests) => ({
  id,
  goal: `${id} goal`,
  files: [`${id}.js`],
  contract: `${id} contract`,
  tests,
  seam: false,
});

test("reports tests+gates when any unit of the plan carries a test scenario", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: {
      plan: {
        test_command: "echo test",
        units: [unitOf("U-1", []), unitOf("U-2", [{ id: "T-001", name: "rejects zero" }])],
      },
      repo: "/abs/target-repo",
    },
    stubs: { agent: verificationStub },
  });

  assert.equal(result.verification, "tests+gates", "one unit with tests is enough");
});

test("reports gates-only when no unit of the plan carries a test scenario", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: {
      plan: { test_command: "echo test", units: [unitOf("U-1", []), unitOf("U-2", [])] },
      repo: "/abs/target-repo",
    },
    stubs: { agent: verificationStub },
  });

  assert.equal(
    result.verification,
    "gates-only",
    "with every unit's tests empty the suite verified nothing",
  );
});
