// implementer が codex-herdr のとき、herdr の pane を tester / coder の 2 つ起動し、全 unit で
// 使い回してから workflow の終わりに閉じる。herdr CLI リファレンス
// (https://herdr.dev/ja/docs/cli-reference/) の pane split / agent start / pane close の 3 つを
// agent の Bash 経由で呼ぶ想定で、split 応答の `.result.pane.pane_id` から取れた pane id を後続の
// agent start / pane close へそのまま渡す。呼び先の区別は label の "pane-start:tester" /
// "pane-start:coder" / "pane-close:tester" / "pane-close:coder" で行う (herdr-check の label 命名
// に倣う)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const codeJs = join(here, "..", "..", "code.js");

const onePlan = {
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

const twoPlan = {
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "first goal",
      files: ["first.js"],
      contract: "first contract",
      tests: [{ id: "T-001", name: "first spec statement" }],
    },
    {
      id: "U-2",
      goal: "second goal",
      files: ["second.js"],
      contract: "second contract",
      tests: [{ id: "T-002", name: "second spec statement" }],
    },
  ],
};

// Fails loudly on any label this scenario should never reach, instead of letting a stray
// call return undefined and mask a wiring mistake as a pass. coderStarted: false reproduces
// the second pane's `agent start` failing (agent_not_ready) after the first pane's split /
// start already succeeded.
const paneStub =
  ({ testerPaneId = "pane-tester-1", coderPaneId = "pane-coder-1", coderStarted = true } = {}) =>
  (prompt, opts) => {
    const label = opts.label ?? "";
    if (label === "herdr-check") return { herdr_available: true, notes: "" };
    if (label === "pane-start:tester") return { pane_id: testerPaneId, started: true, notes: "" };
    if (label === "pane-start:coder")
      return coderStarted
        ? { pane_id: coderPaneId, started: true, notes: "" }
        : { pane_id: "", started: false, notes: "agent start failed: agent_not_ready" };
    if (label === "pane-close:tester") return { closed: true, notes: "" };
    if (label === "pane-close:coder") return { closed: true, notes: "" };
    if (label.startsWith("red:"))
      return { red_confirmed: true, test_files: ["t.test.js"], notes: "", evidence: [] };
    if (label.startsWith("green:")) return { green: true, notes: "", deferred: [] };
    if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
    throw new Error(`unexpected label: ${label}`);
  };

test("codex-herdr のとき tester と coder の 2 つの pane を起動する", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: onePlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: { agent: paneStub() },
  });

  const testerStart = calls.agent.find((c) => c.opts.label === "pane-start:tester");
  const coderStart = calls.agent.find((c) => c.opts.label === "pane-start:coder");
  assert.ok(testerStart, "a pane-start call for the tester role runs");
  assert.ok(coderStart, "a pane-start call for the coder role runs");
  assert.equal(
    calls.agent.filter((c) => (c.opts.label ?? "").startsWith("pane-start:")).length,
    2,
    "exactly 2 panes are started, not more",
  );
});

test("全 unit の実装が終わったあと両方の pane を閉じる", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: twoPlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: { agent: paneStub() },
  });

  const closeTesterIdx = calls.agent.findIndex((c) => c.opts.label === "pane-close:tester");
  const closeCoderIdx = calls.agent.findIndex((c) => c.opts.label === "pane-close:coder");
  const lastGreenIdx = calls.agent.reduce(
    (max, c, i) => (/^green2?:/.test(c.opts.label ?? "") ? i : max),
    -1,
  );
  assert.ok(closeTesterIdx !== -1, "the tester pane is closed");
  assert.ok(closeCoderIdx !== -1, "the coder pane is closed");
  assert.ok(lastGreenIdx !== -1, "both units reach the green step before teardown");
  assert.ok(
    closeTesterIdx > lastGreenIdx,
    "the tester pane closes only after every unit's implementation is done",
  );
  assert.ok(
    closeCoderIdx > lastGreenIdx,
    "the coder pane closes only after every unit's implementation is done",
  );
  assert.deepEqual(result.completed, ["U-1", "U-2"], "both units complete before teardown");
});

test("2 つ目の pane の起動に失敗したとき 1 つ目を閉じてから停止する", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: onePlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: { agent: paneStub({ testerPaneId: "pane-tester-solo", coderStarted: false }) },
  });

  assert.ok(result.stopped, "the run stops instead of returning a normal completion");
  assert.equal(typeof result.why, "string", "the stopped return states why in a string");
  assert.ok(result.why.length > 0, "why is not empty");

  const closeTester = calls.agent.find((c) => c.opts.label === "pane-close:tester");
  assert.ok(closeTester, "the first pane (tester) is closed before the run stops");
  assert.ok(
    closeTester.prompt.includes("pane-tester-solo"),
    "the close call targets the pane id resolved from the split response, not a guessed value",
  );
  assert.ok(
    calls.agent.every((c) => c.opts.label !== "pane-close:coder"),
    "the coder pane never started, so it is never closed",
  );
  assert.ok(
    calls.agent.every((c) => !/^(red|red2|green|green2|impl|impl2):/.test(c.opts.label ?? "")),
    "no unit ever entered implementation",
  );
  assert.ok(
    calls.agent.every((c) => c.opts.label !== "verify"),
    "the run stops before the verify stage",
  );
});

test("2 つ目の unit の実装で 1 つ目と同じ pane を使う", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: twoPlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: { agent: paneStub() },
  });

  assert.deepEqual(result.completed, ["U-1", "U-2"], "both units complete");
  assert.equal(
    calls.agent.filter((c) => c.opts.label === "pane-start:tester").length,
    1,
    "the tester pane is started once, not once per unit",
  );
  assert.equal(
    calls.agent.filter((c) => c.opts.label === "pane-start:coder").length,
    1,
    "the coder pane is started once, not once per unit",
  );
});
