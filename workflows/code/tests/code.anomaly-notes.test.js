// Without separating notes from evidence, the agent reads ctx's "check each claim against the
// tool result" as an instruction to enumerate the evidence into one stretch of prose. The PR
// body renders an anomaly with its newlines collapsed onto one line, leaving the reader unable
// to find where the conclusion ends.
//
// The EN side is observed from a run: what the agent receives is the assembled prompt and the
// schema handed with it, and what the PR reads is the returned anomaly. The .ja mirror never
// runs, so its own wording is matched as text (TESTING.md's tier table).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const codeJs = join(root, "workflows", "code.js");
const jaCodeJs = join(root, ".ja", "workflows", "code.js");

const plan = {
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "sample goal",
      files: ["sample.js"],
      contract: "sample contract",
      tests: [{ id: "T-100", name: "sample spec statement" }],
      seam: false,
    },
  ],
};

// red_confirmed stays false through both attempts, which is the state the notes / evidence
// division exists for: the behavior is already implemented and the run records an anomaly.
const stub = (_prompt, opts) => {
  const label = opts.label ?? "";
  if (label.startsWith("red"))
    return {
      red_confirmed: false,
      test_files: ["sample.test.js"],
      notes: "the target behavior is already implemented",
      evidence: ["sample.test.js:12 drives the same fixture"],
    };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

const run = () =>
  runWorkflow(codeJs, { args: { plan, repo: "/abs/target-repo" }, stubs: { agent: stub } });
const callFor = (calls, label) => {
  const call = calls.agent.find((c) => (c.opts.label ?? "") === label);
  assert.ok(call, `the ${label} agent ran`);
  return call;
};

test("the schema handed to Red keeps the conclusion in notes and the grounds in evidence", async () => {
  const { calls } = await run();
  const { schema } = callFor(calls, "red:U-1").opts;

  assert.deepEqual(schema.required, ["red_confirmed", "test_files", "notes", "evidence"]);
  assert.match(schema.properties.notes.description, /the conclusion in one sentence/);
  assert.match(
    schema.properties.notes.description,
    /Keep the supporting facts out of notes and put them in evidence/,
  );
  assert.match(schema.properties.evidence.description, /the facts backing the conclusion in notes/);
});

// The schema description alone loses to the Red retry's "examine it closely", and the course of
// that examination flows into notes. The division is stated on the prompt side as well.
test("both Red prompts state the division between notes and evidence", async () => {
  const { calls } = await run();

  assert.match(
    callFor(calls, "red:U-1").prompt,
    /put the conclusion in notes as one sentence and the supporting facts in evidence/,
    "Red states the division",
  );
  assert.match(
    callFor(calls, "red2:U-1").prompt,
    /notes carries the conclusion alone, one sentence/,
    "the Red retry states the division",
  );
});

test("an unconfirmed Red returns the anomaly with its evidence beside the notes", async () => {
  const { result } = await run();

  assert.deepEqual(result.anomalies, [
    {
      unit: "U-1",
      kind: "no-red",
      notes: "the target behavior is already implemented",
      evidence: ["sample.test.js:12 drives the same fixture"],
    },
  ]);
});

// The mirror is the one side no run reaches, so its wording is matched as text.
test("the .ja mirror carries the same division in its own wording", async () => {
  const src = await readFile(jaCodeJs, "utf8");

  assert.match(src, /結論を 1 文で書く/, "the schema keeps notes to one conclusion sentence");
  assert.match(src, /根拠は notes に混ぜず evidence へ分ける/, "the grounds go to evidence");
  assert.match(
    src,
    /結論を notes に 1 文で、根拠を evidence に 1 項目 1 行で書く/,
    "Red states the division",
  );
  assert.match(src, /notes に書くのは結論 1 文だけで/, "the Red retry states the division");
});
