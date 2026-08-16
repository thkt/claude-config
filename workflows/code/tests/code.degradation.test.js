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

// A unit carrying tests takes the Red -> Green route. When the red agent returns null, red2
// never runs (red && !red.red_confirmed short-circuits) and if (!red) fires the red-failed
// terminal return.
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

// Returning null on the red: label reproduces a red agent that returns no result.
const redNullStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label === "reference-index") return { found: false, table: "" };
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

// Neither an exception from the reader agent (label: reference-index, DR-0091) nor a partial
// parse failure of a readable table stops the whole run. As WORKFLOWS.md § Degradation
// recording demands, the loss stays recorded at granularity. Contract: the anomalies element
// shape {unit, kind, notes} does not change, and a run-level anomaly (belonging to no
// particular unit) carries the fixed value "run" in unit. A single unit with no tests (one
// direct implementation step) keeps the path to the reader and table-parse degradation short.
const directImplPlan = {
  test_command: "echo test",
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
};

// Only reference-index throws; every other label returns the minimum response the single direct
// implementation step needs to run through. An unknown label throws, the same shape as
// code.reference.test.js.
const readerThrowsStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label === "reference-index") throw new Error("reader agent boom");
  if (label.startsWith("impl:")) return { green: true, notes: "", deferred: [] };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

test("runs through without injection and records the reason as an anomaly when the reader agent throws", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: directImplPlan, repo: "" },
    stubs: { agent: readerThrowsStub },
  });

  assert.deepEqual(
    result.completed,
    ["U-1"],
    "a throwing reader agent does not stop the run, which implements the unit through",
  );

  const implCall = calls.agent.find((c) => (c.opts.label ?? "") === "impl:U-1");
  assert.ok(implCall, "the impl step still runs after the reader agent throws");
  assert.doesNotMatch(
    implCall.prompt,
    /reference-index/,
    "a throwing reader agent leaves the reference-index block out of the impl prompt",
  );

  const readerAnomaly = result.anomalies.find((a) => a.kind === "reader-failed");
  assert.ok(
    readerAnomaly,
    "the reader agent exception is recorded as an anomaly of kind reader-failed",
  );
  assert.equal(
    readerAnomaly.unit,
    "run",
    'a run-level anomaly carries the fixed value "run" in unit',
  );
  assert.match(
    readerAnomaly.notes,
    /reader agent boom/,
    "the anomaly notes keep the reason (the error message)",
  );
});

// reference-index itself is readable, but one row of the table is broken (its cell count is not
// 3). One of the three data rows is broken, so two rows parse.
const partialTable =
  "| glob | description | path |\n" +
  "| --- | --- | --- |\n" +
  "| a.js | desc a | docs/a.md |\n" +
  "| bad.js | broken row (too few cells) |\n" +
  "| c.js | desc c | docs/c.md |\n";

const partialTableStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label === "reference-index") return { found: true, table: partialTable };
  if (label.startsWith("impl:")) return { green: true, notes: "", deferred: [] };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

test("logs the parsed row count and the total when the table parses only partially", async () => {
  const { logs } = await runWorkflow(codeJs, {
    args: { plan: directImplPlan, repo: "" },
    stubs: { agent: partialTableStub },
  });

  assert.ok(
    logs.some((entry) => /2\s*\/\s*3/.test(entry)),
    "the log carries the parsed row count (2) and the total (3)",
  );
});
