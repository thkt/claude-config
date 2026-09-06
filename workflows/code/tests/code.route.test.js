// U-004: implementer が codex-herdr のとき、実装 agent の呼び出しを経路で振り分ける。Red の指示は
// pane split から解決した tester の pane id 宛に、Green と直接実装 (テストを持たない unit) の指示は
// coder の pane id 宛に送られる (herdr agent target はライブエージェント名か、それをホストする pane id
// のどちらかを受け付ける。id を推測しないという既存 pane 群のルールを踏襲し、role 名ではなく split で
// 解決した id で宛先を書く)。retry (green2) は Green 初回と同じ pane id 宛に送られる。
// workflows/code.js の implementOpts が担っていた集約 (model / effort) は、経路 (claude / codex-herdr)
// と呼び先 (pane の有無・どちらの pane か) を 1 箇所で決める関数に広がる。claude 経路は従来どおり model /
// effort を持つが、codex-herdr 経路の呼び出しは pane 宛のため model / effort を持たない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.ts";

const here = dirname(fileURLToPath(import.meta.url));
const codeJs = join(here, "..", "..", "code.js");

const TESTER_PANE_ID = "pane-tester-1";
const CODER_PANE_ID = "pane-coder-1";

const tddPlan = {
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

const directPlan = {
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

// Fails loudly on any label this scenario should never reach, instead of letting a stray call
// return undefined and mask a wiring mistake as a pass. The pane lifecycle labels always resolve
// the same way pane and implementer tests already stub; each test supplies only the
// implementation-step labels (red / green / green2 / impl) it needs via `extra`.
const paneLifecycleStub =
  (extra = {}) =>
  (prompt, opts) => {
    const label = opts.label ?? "";
    if (label === "herdr-check") return { herdr_available: true, notes: "" };
    if (label === "pane-start:tester") return { pane_id: TESTER_PANE_ID, started: true, notes: "" };
    if (label === "pane-start:coder") return { pane_id: CODER_PANE_ID, started: true, notes: "" };
    if (label === "pane-close:tester") return { closed: true, notes: "" };
    if (label === "pane-close:coder") return { closed: true, notes: "" };
    if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
    if (typeof extra[label] === "function") return extra[label]();
    throw new Error(`unexpected label: ${label}`);
  };

test("T-010 the Red instruction goes to the tester pane id resolved from the split result", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: tddPlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: {
      agent: paneLifecycleStub({
        "red:U-1": () => ({
          red_confirmed: true,
          test_files: ["t.test.js"],
          notes: "",
          evidence: [],
        }),
        "green:U-1": () => ({ green: true, notes: "", deferred: [] }),
      }),
    },
  });

  const red = calls.agent.find((c) => c.opts.label === "red:U-1");
  assert.ok(red, "the red step for U-1 runs");
  assert.ok(
    red.prompt.includes(TESTER_PANE_ID),
    "the Red instruction addresses the tester pane id resolved from split, not a guessed value",
  );
  assert.equal(red.opts.model, undefined, "a pane-addressed call carries no model option");
  assert.equal(red.opts.effort, undefined, "a pane-addressed call carries no effort option");
});

test("T-011 the Green instruction goes to the coder pane id resolved from the split result", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: tddPlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: {
      agent: paneLifecycleStub({
        "red:U-1": () => ({
          red_confirmed: true,
          test_files: ["t.test.js"],
          notes: "",
          evidence: [],
        }),
        "green:U-1": () => ({ green: true, notes: "", deferred: [] }),
      }),
    },
  });

  const green = calls.agent.find((c) => c.opts.label === "green:U-1");
  assert.ok(green, "the green step for U-1 runs");
  assert.ok(
    green.prompt.includes(CODER_PANE_ID),
    "the Green instruction addresses the coder pane id resolved from split, not a guessed value",
  );
  assert.equal(green.opts.model, undefined, "a pane-addressed call carries no model option");
  assert.equal(green.opts.effort, undefined, "a pane-addressed call carries no effort option");
});

test("T-012 the direct-implementation instruction for a unit with no tests goes to the coder pane id", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: directPlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: {
      agent: paneLifecycleStub({
        "impl:U-1": () => ({ green: true, notes: "", deferred: [] }),
      }),
    },
  });

  const impl = calls.agent.find((c) => c.opts.label === "impl:U-1");
  assert.ok(impl, "the direct implementation step for U-1 runs");
  assert.ok(
    impl.prompt.includes(CODER_PANE_ID),
    "the direct implementation instruction addresses the coder pane id resolved from split, not a guessed value",
  );
  assert.equal(impl.opts.model, undefined, "a pane-addressed call carries no model option");
  assert.equal(impl.opts.effort, undefined, "a pane-addressed call carries no effort option");
});

test("T-013 the Green retry instruction goes to the same pane id as the first Green", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: tddPlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: {
      agent: paneLifecycleStub({
        "red:U-1": () => ({
          red_confirmed: true,
          test_files: ["t.test.js"],
          notes: "",
          evidence: [],
        }),
        "green:U-1": () => ({ green: false, notes: "still failing" }),
        "green2:U-1": () => ({ green: true, notes: "", deferred: [] }),
      }),
    },
  });

  const green = calls.agent.find((c) => c.opts.label === "green:U-1");
  const green2 = calls.agent.find((c) => c.opts.label === "green2:U-1");
  assert.ok(green, "the first green call runs");
  assert.ok(green2, "the green retry call runs");
  assert.ok(
    green.prompt.includes(CODER_PANE_ID),
    "the first green call addresses the coder pane id",
  );
  assert.ok(
    green2.prompt.includes(CODER_PANE_ID),
    "the green retry addresses the same coder pane id as the first attempt, not a re-resolved one",
  );
});
