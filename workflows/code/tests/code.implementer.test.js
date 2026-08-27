// input.implementer selects who implements each unit. Absent or "claude" keeps the existing
// Claude-agent path unchanged. "codex-herdr" first confirms herdr is reachable (an agent-run
// `command -v herdr` + `herdr agent get`, mirroring assert.js's codex_available check) before
// any unit enters implementation; unreachable herdr stops the run instead of falling back
// silently. Any other value stops the run without touching the network or the agent at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
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

// Fails loudly on any label this scenario should never reach, instead of letting a
// stray call return undefined and mask a wiring mistake as a pass.
const happyAgentStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label.startsWith("red:"))
    return { red_confirmed: true, test_files: ["t.test.js"], notes: "", evidence: [] };
  if (label.startsWith("green:")) return { green: true, notes: "", deferred: [] };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

test("implementer を渡さないと既存の Claude 経路で実装が進む", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo" },
    stubs: { agent: happyAgentStub },
  });

  assert.deepEqual(result.completed, ["U-1"], "the unit implements via the existing path");
  assert.ok(
    calls.agent.every((c) => !/herdr/i.test(c.opts.label ?? "")),
    "no herdr reachability check runs when implementer is unspecified",
  );
});

test("implementer が codex-herdr で herdr に到達できないとき stopped を返して実装に入らない", async () => {
  const herdrUnreachableStub = (prompt, opts) => {
    const label = opts.label ?? "";
    if (/herdr/i.test(label))
      return { herdr_available: false, notes: "command -v herdr: not found" };
    throw new Error(`unexpected label: ${label}`);
  };
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: { agent: herdrUnreachableStub },
  });

  assert.ok(result.stopped, "the run stops instead of returning a normal completion");
  assert.equal(typeof result.why, "string", "the stopped return states why in a string");
  assert.ok(result.why.length > 0, "why is not empty");
  assert.equal(result.completed, undefined, "no unit reaches completed");
  assert.ok(
    calls.agent.some((c) => /herdr/i.test(c.opts.label ?? "")),
    "a herdr reachability check ran",
  );
  assert.ok(
    calls.agent.every((c) => !/^(red|red2|green|green2|impl|impl2):/.test(c.opts.label ?? "")),
    "no unit ever entered implementation",
  );
});

test("implementer が claude と codex-herdr のどちらでもない値のとき stopped を返す", async () => {
  const unreachedAgent = () => {
    throw new Error("no agent call is expected for an invalid implementer value");
  };
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo", implementer: "gpt-5" },
    stubs: { agent: unreachedAgent },
  });

  assert.ok(result.stopped, "an unrecognized implementer value stops the run");
  assert.equal(typeof result.why, "string", "the stopped return states why in a string");
  assert.equal(
    calls.agent.length,
    0,
    "the value is rejected before any agent call, herdr included",
  );
});

test("implementer が claude のとき herdr の可用性チェックを走らせない", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo", implementer: "claude" },
    stubs: { agent: happyAgentStub },
  });

  assert.deepEqual(result.completed, ["U-1"], "the unit implements via the existing path");
  assert.ok(
    calls.agent.every((c) => !/herdr/i.test(c.opts.label ?? "")),
    "no herdr reachability check runs when implementer is claude",
  );
});
