// U-008 seam: workflows/_lib/run-workflow.js's runWorkflow records only the agent's
// {prompt, opts} (calls.agent), so a test asserting on prompt wording alone (as
// code.pane.test.js does for U-003's pane-start / pane-close calls) cannot show that the
// resolved pane id and the pane open/close count actually reach code.js's own return
// value - the value build.js forwards on into its own return value (see
// build.behavior.test.js's T-023). This file asserts against `result`, not `calls`, to
// close that seam.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const codeJs = join(here, "..", "..", "code.js");

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

// Every role/label pair the codex-herdr route can reach for a 2-unit plan that goes
// straight through Red -> Green for both units.
const paneStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label === "herdr-check") return { herdr_available: true, notes: "" };
  if (label === "pane-start:tester") return { pane_id: "pane-tester-1", started: true, notes: "" };
  if (label === "pane-start:coder") return { pane_id: "pane-coder-1", started: true, notes: "" };
  if (label === "pane-close:tester") return { closed: true, notes: "" };
  if (label === "pane-close:coder") return { closed: true, notes: "" };
  if (label.startsWith("red:"))
    return { red_confirmed: true, test_files: ["t.test.js"], notes: "", evidence: [] };
  if (label.startsWith("green:")) return { green: true, notes: "", deferred: [] };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

test("T-022 codex-herdr で 2 unit の plan を通すと返り値の pane 開閉回数が 1 組になる", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan: twoPlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: { agent: paneStub },
  });

  assert.deepEqual(
    result.completed,
    ["U-1", "U-2"],
    "both units complete, so the pane lifecycle below covers the whole run, not a partial one",
  );
  assert.deepEqual(
    result.herdr_panes,
    { tester: "pane-tester-1", coder: "pane-coder-1" },
    "the return value carries the pane ids resolved from pane split, not just the calls made to reach them",
  );
  assert.equal(
    result.pane_opens,
    2,
    "the tester and coder panes each open once across the whole run - reuse across the 2 units means this stays 2, not 4",
  );
  assert.equal(
    result.pane_closes,
    2,
    "the same 2 panes close once each at teardown, so opens and closes form exactly 1 matched pair per pane",
  );
});
