// U-003: behavior test that code.js propagates an optional input.model only to the
// Red / Green implementation agents (defaulting to sonnet), which always run at effort high.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..", "..");
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

// tests が空の unit は plan の選択により Red→Green でなく直接実装になる。
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

// red / green fail on the first call to fire the retries (red2 / green2), so all
// 4 calls (red, red2, green, green2) get captured.
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

test("model 指定時に Red / Green とその retry の 4 呼び出しへ伝播し Verify は固定 sonnet のまま", async () => {
  const { calls } = await runWorkflow(codeJs, {
    // A model distinct from Verify's fixed sonnet, so the assertions below can
    // tell input.model propagation apart from the fixed value.
    args: { plan, repo: "", model: "haiku" },
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

test("model 未指定で Red / Green の opts が既定の sonnet と effort high を持ち完走する", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "" },
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

// seam unit のテストだけが層と層の結線漏れで落ちる。内部層を stub すると unit の意味が
// 消えるので、その禁止を Red / Green の prompt に載せることを固定する (kizalas #558)。
test("seam: true の unit だけ Red / Green の prompt に内部層 stub 禁止と導線 assert の指示が載る", async () => {
  const seamPlan = (seam) => ({
    test_command: "echo test",
    units: [{ ...plan.units[0], seam }],
  });

  const promptsFor = async (seam) => {
    const { calls } = await runWorkflow(codeJs, {
      args: { plan: seamPlan(seam), repo: "" },
      stubs: { agent: happyAgentStub },
    });
    return calls.agent
      .filter((c) => /^(red|green):/.test(c.opts.label))
      .map((c) => c.prompt)
      .join("\n");
  };

  const withSeam = await promptsFor(true);
  assert.match(withSeam, /seam unit/, "seam unit である旨が prompt に載る");
  assert.match(withSeam, /stub/, "内部層 stub の禁止が prompt に載る");

  const withoutSeam = await promptsFor(false);
  assert.doesNotMatch(withoutSeam, /seam unit/, "seam: false の unit には seam 指示が載らない");
});

// 実装中の advisor 相談は build の設計 (blocker は anomaly として記録して進み、重い assurance
// は draft PR 上で人間が起動する) と噛み合わないので、3 経路すべての実装 prompt に
// no-advisor constraint が載り、Verify には載らないことを固定する (#221)。
test("direct impl / Red / Green の prompt に advisor 禁止と anomaly 記録への誘導が載り Verify には載らない", async () => {
  const directStub = (prompt, opts) => {
    const label = opts.label ?? "";
    if (label.startsWith("impl:")) return { green: true, notes: "" };
    if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
    throw new Error(`unexpected label: ${label}`);
  };
  const { calls: tddCalls } = await runWorkflow(codeJs, {
    args: { plan, repo: "" },
    stubs: { agent: happyAgentStub },
  });
  const { calls: directCalls } = await runWorkflow(codeJs, {
    args: { plan: noTestPlan, repo: "" },
    stubs: { agent: directStub },
  });

  const implementCalls = [...tddCalls.agent, ...directCalls.agent].filter((c) =>
    /^(red|green|impl):/.test(c.opts.label),
  );
  assert.equal(implementCalls.length, 3, "red / green / impl の 3 経路が揃う");
  for (const call of implementCalls) {
    assert.match(call.prompt, /advisor tool/, `${call.opts.label} に advisor 禁止が載る`);
    assert.match(call.prompt, /anomaly/, `${call.opts.label} に anomaly 記録への誘導が載る`);
  }

  const verify = tddCalls.agent.find((c) => c.opts.label === "verify");
  assert.doesNotMatch(
    verify.prompt,
    /advisor/,
    "Verify の prompt に advisor constraint は載らない",
  );
});

test("tests 空の unit は Red / Green を呼ばず直接実装 (impl) 1 段で完走し、model / effort が伝播する", async () => {
  const directStub = (prompt, opts) => {
    const label = opts.label ?? "";
    if (label.startsWith("impl:")) return { green: true, notes: "" };
    if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
    throw new Error(`unexpected label: ${label}`);
  };
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: noTestPlan, repo: "", model: "haiku" },
    stubs: { agent: directStub },
  });

  const labels = calls.agent.map((c) => c.opts.label);
  assert.ok(
    labels.every((l) => !/^(red|red2|green|green2):/.test(l)),
    "Red / Green agent は呼ばれない",
  );
  const impl = calls.agent.find((c) => c.opts.label === "impl:U-1");
  assert.ok(impl, "直接実装 agent impl:U-1 が呼ばれる");
  assert.equal(impl.opts.model, "haiku", "impl に input.model が伝播する");
  assert.equal(impl.opts.effort, "high", "impl は effort high で走る");
  assert.deepEqual(result.completed, ["U-1"], "直接実装 unit が completed に載る");
});

test("tests 空の unit の直接実装が 2 回失敗すると stopped: unit-failed で fail-close する", async () => {
  const failingStub = (prompt, opts) => {
    const label = opts.label ?? "";
    if (label.startsWith("impl2:")) return { green: false, notes: "still red" };
    if (label.startsWith("impl:")) return { green: false, notes: "suite failed" };
    throw new Error(`unexpected label: ${label}`);
  };
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: noTestPlan, repo: "" },
    stubs: { agent: failingStub },
  });
  assert.equal(result.stopped, "unit-failed", "retry 後も green でなければ unit-failed");
  assert.ok(
    calls.agent.some((c) => c.opts.label === "impl2:U-1"),
    "直接実装の retry (impl2) が 1 回走る",
  );
});

test("静的 gate が JA / EN の code.js と tests/*.js で pass する", () => {
  const targets = [
    join(root, ".ja", "workflows", "code.js"),
    join(root, "workflows", "code.js"),
    join(root, ".ja", "workflows", "_lib", "run-workflow.js"),
    join(root, "workflows", "_lib", "run-workflow.js"),
    join(root, ".ja", "workflows", "code", "tests", "code.model.test.js"),
    join(root, "workflows", "code", "tests", "code.model.test.js"),
  ];
  for (const file of targets) {
    execFileSync("node", ["--check", file], { cwd: root });
  }
  execFileSync("npx", ["oxlint", ...targets], { cwd: root });
});
