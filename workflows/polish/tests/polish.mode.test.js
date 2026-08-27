// Mirrors workflows/audit/tests/audit.routing.test.js's FOCUS membership tests: a mode outside
// the valid set stops the run before any agent spawns, and the why is generated from the same
// table the run checks against, never hand-copied. The valid-value list comes from the same
// parseRoutingLikeConst extraction audit.routing.test.js uses, so this test never copies MODES's
// spellings by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";
import { parseRoutingLikeConst } from "../../_lib/tests/_brace.js";

const here = dirname(fileURLToPath(import.meta.url));
const polishJs = join(here, "..", "..", "polish.js");

// The shortest stub carrying Review -> Challenge -> Fix -> Rejudge -> Cleanup (mode: full).
const agentStub = (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "codex") {
    return {
      available: true,
      has_changes: true,
      diff_kind: "uncommitted",
      findings: [{ id: "F1", title: "finding title", detail: "finding detail", severity: "P1" }],
    };
  }
  if (label === "challenge") {
    return { verdicts: [{ id: "F1", verdict: "confirmed" }] };
  }
  if (label === "fix") {
    return { fixed: ["F1 fixed"], stashed: [], tests_pass: true };
  }
  if (label === "validate") {
    return { edits: [], tests_pass: true, stashed: false };
  }
  return undefined;
};

test("a mode outside MODES stops the run before any agent spawns and the why names every valid mode", async () => {
  const source = readFileSync(polishJs, "utf8");
  const modes = parseRoutingLikeConst(source, "MODES");
  assert.ok(modes, "MODES is extractable from polish.js");
  const validModes = Object.keys(modes);

  const { result, calls } = await runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo", mode: "not-a-real-mode" },
    stubs: {},
  });

  assert.equal(result.stopped, "invalid-mode");
  for (const validMode of validModes) {
    assert.match(result.why, new RegExp(validMode), `the why names the valid mode "${validMode}"`);
  }
  assert.equal(calls.agent.length, 0, "no agent runs before mode membership is confirmed");
});

test("an omitted mode still runs the full review to cleanup path", async () => {
  const { result, calls } = await runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo" },
    stubs: { agent: agentStub },
  });

  assert.equal(result.mode, "full", "the omitted mode default still reports as full");
  const labels = calls.agent.map((c) => c.opts && c.opts.label);
  for (const expected of ["codex", "challenge", "fix", "validate"]) {
    assert.ok(labels.includes(expected), `the ${expected} agent ran on the default mode`);
  }
  assert.ok(result.cleanup, "the cleanup stage result is present, so the path reached Cleanup");
});
