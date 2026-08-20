// code.js's red-failed terminal return states the reason in why. The why string is localized
// per EN / JA, so these cases inspect the presence and type of why plus the stopped token
// ("red-failed") rather than the string content.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const codeJs = join(here, "..", "..", "code.js");

// A null first result skips the retry, so red2 never runs and the red-failed terminal return
// fires instead.
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

const redNullStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label.startsWith("red:")) return null;
  throw new Error(`unexpected label: ${label}`);
};

test("includes why in the stopped: red-failed return value when the red agent returns null", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan, repo: "" },
    stubs: { agent: redNullStub },
  });
  assert.equal(result.stopped, "red-failed", "a null red stops the run as red-failed");
  assert.ok(result.why, "the red-failed return value carries why");
  assert.equal(typeof result.why, "string", "why is a string stating the reason");
});

// A unit whose Red stays unconfirmed was never implemented. Counting it in completed lets the
// caller's units_completed report work that did not happen, so it is reported in skipped.
const noRedStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label.startsWith("red:") || label.startsWith("red2:"))
    return {
      red_confirmed: false,
      test_files: ["t.test.js"],
      notes: "already implemented",
      evidence: [],
    };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

test("counts a unit with an unconfirmed Red in skipped rather than in completed", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan, repo: "" },
    stubs: { agent: noRedStub },
  });

  assert.deepEqual(result.completed, [], "an unimplemented unit does not inflate completed");
  assert.deepEqual(result.skipped, ["U-1"], "it is reported in skipped instead");
  assert.deepEqual(
    result.anomalies.map((a) => a.kind),
    ["no-red"],
    "the no-red anomaly still records why the implementation was skipped",
  );
});
