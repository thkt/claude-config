// The shake workflow records degradation in its per-target result. A stall in the smell stage
// stays distinguishable from a genuine stable verdict with empty smells, and when the pipeline
// drops a target to null the final return value keeps that target's id.
//
// Both the EN and JA shake.js hold their structured field values in English, so these cases
// inspect the structural tokens of the return value rather than the localized prompt strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const shakeJs = join(here, "..", "..", "shake.js");

// T-002 uses the default pipeline injected by run-workflow.js as it stands (a copy of the
// production contract, leaving a failed item as null in place). T-003 reproduces "the pipeline
// dropped a target to null" deterministically by injecting a stubs.pipeline that skips the
// dropIds targets past every stage and pushes null instead.
const dropPipeline = (dropIds) => async (items, stage1, stage2) => {
  const out = [];
  for (const it of items) {
    if (dropIds.includes(it.id)) {
      out.push(null);
      continue;
    }
    out.push(await stage2(await stage1(it), it));
  }
  return out;
};

const RUNS = 10;
const passRuns = () => ({
  ran: true,
  runs: Array.from({ length: RUNS }, () => ({ pass: true })),
  notes: "",
});
const fourDimCommands = { repeat: "cmd", order: "cmd", parallelism: "cmd", seed: "cmd" };

test("records the smell stage stall in the per-target result so it differs from a stable verdict", async () => {
  // Two targets. The smell agent stalls (null) on t-alpha and survives on t-beta with empty
  // smells. All four dimensions pass for both, so the script classifies both as "stable".
  // Without recording the stall, the two per-target results are indistinguishable. The ids are
  // neutral names carrying no discriminator token (stall / no output) so they cannot match
  // themselves.
  const agentStub = (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "route") {
      return {
        ecosystem: "jest",
        targets: [
          { id: "t-alpha", file: "a.test.js", commands: fourDimCommands },
          { id: "t-beta", file: "b.test.js", commands: fourDimCommands },
        ],
        reason: "",
      };
    }
    if (label === "smell:t-alpha") return null; // stall
    if (label === "smell:t-beta") return { smells: [] }; // alive, no smell
    if (label && label.startsWith("shake:")) return passRuns(); // stable on every dimension
    return undefined;
  };

  const { result } = await runWorkflow(shakeJs, {
    args: { repo: "/abs/target-repo" },
    stubs: { agent: agentStub },
  });
  assert.ok(
    result && Array.isArray(result.targets),
    "the workflow returns an array of per-target results",
  );
  const stalled = result.targets.find((t) => t.id === "t-alpha");
  const stable = result.targets.find((t) => t.id === "t-beta");
  assert.ok(stalled && stable, "both the stalled and the genuinely stable target stay in result");

  const stalledText = JSON.stringify(stalled);
  const stableText = JSON.stringify(stable);
  assert.ok(
    /stall|no output/i.test(stalledText),
    "the per-target result of a target whose smell stage stalled records the stall",
  );
  assert.ok(
    !/stall|no output/i.test(stableText),
    "a genuinely stable target carries no stall marker, keeping stall and stable apart",
  );
});

test("records the dropped target id in the final return value when the pipeline drops it to null", async () => {
  const agentStub = (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "route") {
      return {
        ecosystem: "jest",
        targets: [
          { id: "t-keep", file: "keep.test.js", commands: fourDimCommands },
          { id: "t-drop", file: "drop.test.js", commands: fourDimCommands },
        ],
        reason: "",
      };
    }
    if (label === "smell:t-keep") return { smells: [] };
    if (label && label.startsWith("shake:t-keep:")) return passRuns();
    return undefined; // t-drop is short-circuited in the pipeline and never reaches an agent
  };

  const { result } = await runWorkflow(shakeJs, {
    args: { repo: "/abs/target-repo" },
    stubs: { agent: agentStub, pipeline: dropPipeline(["t-drop"]) },
  });
  assert.ok(result && Array.isArray(result.targets), "the workflow returns a result object");
  const survivingIds = result.targets.map((t) => t.id);
  assert.deepEqual(
    survivingIds,
    ["t-keep"],
    "only the target that was not dropped stays in targets",
  );

  assert.ok(
    JSON.stringify(result).includes("t-drop"),
    "the final return value records the dropped target id t-drop",
  );
});

// Without repo the anchor was a no-op and the agent resolved the repository from its own cwd,
// which #204 measured running a step in the wrong checkout (DR-0105).
test("T-005 a shake run with no args.repo stops with no-repo and names the argument shape", async () => {
  const { result, calls } = await runWorkflow(shakeJs, { args: {}, stubs: {} });
  assert.equal(result.stopped, "no-repo");
  assert.match(result.why, /args\.repo/, "the reason names the argument to pass");
  assert.equal(calls.agent.length, 0, "no agent runs before the target repository is known");
});
