// The plan carries the rules, so nothing is read at implementation time. What reaches the agent
// is decided in the plan and readable from the issue body alone. The injected wording is
// localized per EN / JA, so only the expected strings here follow the EN version.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const codeJs = join(here, "..", "..", "code.js");

const RULE = {
  source: "docs/wiki/ja-mirror-drift.md",
  quote: ".ja/ を先に編集し EN を同一コミットで",
};
const SECOND = {
  source: "docs/wiki/pr-scope-separation.md",
  quote: "issue の Scope に無いファイルを洗い出す",
};

// One unit, no tests: the shortest path to the impl step's prompt.
const implPlan = (rules) => ({
  test_command: "echo test",
  rules,
  units: [
    {
      id: "U-1",
      goal: "docs goal",
      files: ["sample.js"],
      contract: "docs contract",
      tests: [],
      seam: false,
    },
  ],
});

// Only the red step's prompt is under observation, so no green stub is provided.
const redPlan = (rules) => ({
  test_command: "echo test",
  rules,
  units: [
    {
      id: "U-1",
      goal: "impl goal",
      files: ["sample.js"],
      contract: "impl contract",
      tests: [{ id: "T-100", name: "sample spec statement" }],
      seam: false,
    },
  ],
});

const stub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label.startsWith("impl:")) return { green: true, notes: "", deferred: [] };
  if (label.startsWith("red:") || label.startsWith("red2:"))
    return { red_confirmed: false, test_files: [], notes: "already implemented" };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

const promptFor = (calls, label) => {
  const call = calls.agent.find((c) => (c.opts.label ?? "") === label);
  assert.ok(call, `the ${label} agent ran`);
  return call.prompt;
};

test("a rule the plan carries reaches the implementation prompt with its source", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan([RULE]), repo: "/abs/target-repo" },
    stubs: { agent: stub },
  });
  const prompt = promptFor(calls, "impl:U-1");
  assert.match(prompt, /---- rules start ----/);
  assert.ok(prompt.includes(`${RULE.source}: ${RULE.quote}`), "source and quote arrive together");
  assert.match(prompt, /---- rules end ----/);
});

// A quoted rule comes from a document a person wrote, so the block states its own status. Without
// it a rule reading like an instruction would compete with the step's own instructions.
test("the rules block declares itself data rather than instructions", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan([RULE]), repo: "/abs/target-repo" },
    stubs: { agent: stub },
  });
  assert.match(promptFor(calls, "impl:U-1"), /data, not instructions/);
});

// Red writes the failing test; a rule about how to implement does not belong there and would
// only spend the step's attention.
test("the Red step's prompt carries no rules block", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: redPlan([RULE]), repo: "/abs/target-repo" },
    stubs: { agent: stub },
  });
  assert.doesNotMatch(promptFor(calls, "red:U-1"), /---- rules start ----/);
});

test("every rule the plan carries reaches the prompt, in the plan's order", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan([RULE, SECOND]), repo: "/abs/target-repo" },
    stubs: { agent: stub },
  });
  const prompt = promptFor(calls, "impl:U-1");
  assert.ok(prompt.indexOf(RULE.quote) < prompt.indexOf(SECOND.quote), "the plan's order holds");
});

// A plan with no rules must not leave an empty block behind; an empty marker pair reads as
// "the rules were dropped" rather than "there were none".
test("a plan with no rules injects nothing", async () => {
  for (const rules of [[], undefined]) {
    const { calls } = await runWorkflow(codeJs, {
      args: { plan: implPlan(rules), repo: "/abs/target-repo" },
      stubs: { agent: stub },
    });
    assert.doesNotMatch(
      promptFor(calls, "impl:U-1"),
      /---- rules/,
      `rules=${JSON.stringify(rules)}`,
    );
  }
});

// Nothing may reach for a document at implementation time; that lookup is what the plan replaced.
test("the code workflow starts no agent that reads a reference document", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: implPlan([RULE]), repo: "/abs/target-repo" },
    stubs: { agent: stub },
  });
  const labels = calls.agent.map((c) => c.opts.label ?? "");
  assert.deepEqual(
    labels.filter((l) => l.includes("reference") || l.includes("index")),
    [],
    "no reader agent runs",
  );
});
