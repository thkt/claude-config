// polish's diff fallback: with scope omitted the target is the uncommitted changes, and
// base...HEAD (the pushed branch diff) when there are none. These cases pin that the fix and
// cleanup targets switch on the diff_kind the codex agent returns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const polishJs = join(here, "..", "..", "polish.js");

// The shortest stub carrying Review -> Challenge -> Fix -> Cleanup. Only diff_kind varies.
const agentStub = (diffKind) => (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "codex") {
    return {
      available: true,
      has_changes: true,
      diff_kind: diffKind,
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

const promptOf = (calls, label) => calls.agent.find((c) => c.opts && c.opts.label === label).prompt;

test("the Review prompt carries the branch fallback check and the --base run when scope is omitted", async () => {
  const { calls } = await runWorkflow(polishJs, {
    args: {},
    stubs: { agent: agentStub("branch") },
  });
  const review = promptOf(calls, "codex");
  assert.match(review, /git rev-list --count main\.\.HEAD/, "rev-list decides the ahead commits");
  assert.match(review, /codex review --base main/, "a branch diff runs codex with --base");
});

test("the fix and cleanup targets become base...HEAD when diff_kind is branch", async () => {
  const { calls, result } = await runWorkflow(polishJs, {
    args: {},
    stubs: { agent: agentStub("branch") },
  });
  assert.match(promptOf(calls, "fix"), /git diff main\.\.\.HEAD/, "fix targets the branch diff");
  assert.match(promptOf(calls, "simplify"), /main\.\.\.HEAD/, "cleanup targets the branch diff");
  assert.equal(result.diff_kind, "branch", "the return value carries diff_kind");
});

test("the fix target stays git diff HEAD when diff_kind is uncommitted", async () => {
  const { calls } = await runWorkflow(polishJs, {
    args: {},
    stubs: { agent: agentStub("uncommitted") },
  });
  assert.match(promptOf(calls, "fix"), /git diff HEAD/);
});

test("a given base propagates into the Review and Fix prompts", async () => {
  const { calls } = await runWorkflow(polishJs, {
    args: { base: "develop" },
    stubs: { agent: agentStub("branch") },
  });
  assert.match(promptOf(calls, "codex"), /codex review --base develop/);
  assert.match(promptOf(calls, "fix"), /git diff develop\.\.\.HEAD/);
});
