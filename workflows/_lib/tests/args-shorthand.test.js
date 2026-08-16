// Every other test that drives a script passes args as an object, so parseArgs's shorthand
// branch ran nowhere. rules/conventions/WORKFLOWS.md § Taking arguments and prompts carries the
// convention.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../run-workflow.js";

const workflowsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = (name) => join(workflowsDir, name);
const promptsOf = (calls) => calls.agent.map((c) => c.prompt).join("\n");

// Carries Review -> Challenge -> Fix -> Cleanup with no findings, which is the shortest
// path that still emits the Review prompt where scope lands.
const polishStub = (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "codex")
    return { available: true, has_changes: true, diff_kind: "branch", findings: [] };
  if (label === "challenge") return { verdicts: [] };
  if (label === "fix") return { fixed: [], stashed: [], tests_pass: true };
  if (label === "validate") return { edits: [], tests_pass: true, stashed: false };
  return undefined;
};

// One target that stays stable across all four dimensions.
const shakeStub = (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "route")
    return {
      ecosystem: "jest",
      targets: [
        {
          id: "t1",
          file: "a.test.js",
          commands: { repeat: "x", order: "x", parallel: "x", seed: "x" },
        },
      ],
      reason: "",
    };
  if (label && label.startsWith("smell:")) return { smells: [] };
  if (label && label.startsWith("shake:"))
    return { runs: Array.from({ length: 10 }, () => ({ passed: true })) };
  return undefined;
};

const adriftStub = (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "detect") return { documents: [] };
  if (label === "report") return { written: true };
  return undefined;
};

// mode none skips the worktree, so Bootstrap alone shows whether scope was read.
const assertStub = (prompt, opts) => {
  if (opts && opts.label === "bootstrap")
    return {
      codex_available: false,
      mode: "none",
      scope_files: [],
      outcome: "absent",
      worktree_ok: false,
      install: "skip",
      build: "skipped",
    };
  return undefined;
};

const cases = [
  { name: "polish", file: "polish.js", arg: "src/", stub: polishStub, shorthand: "scope" },
  { name: "shake", file: "shake.js", arg: "a.test.js", stub: shakeStub, shorthand: "scope" },
  { name: "adrift", file: "adrift.js", arg: "docs/dr", stub: adriftStub, shorthand: "dir" },
  { name: "assert", file: "assert.js", arg: "src/", stub: assertStub, shorthand: "scope" },
];

for (const { name, file, arg, stub, shorthand } of cases) {
  test(`${name} reads a string arg as the ${shorthand} shorthand`, async () => {
    const { calls } = await runWorkflow(script(file), { args: arg, stubs: { agent: stub } });
    assert.ok(calls.agent.length > 0, `${name} spawned no agent, so no prompt carries the arg`);
    assert.ok(
      promptsOf(calls).includes(arg),
      `${name} dropped the ${shorthand} shorthand ${arg} before the agent prompts`,
    );
  });
}

// An id list is the one string adrift reads as focus rather than dir. A DR matching no focus
// token makes the narrowing visible in the return value.
const adriftWithDr = (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "detect")
    return {
      found: true,
      dr_dir: "docs/decisions",
      drs: [{ id: "0099", file: "0099-sample.md", title: "sample" }],
      manifest: "other",
      dr_refs: [],
    };
  if (label === "report") return { written: true };
  return undefined;
};

test("adrift reads an id list as the focus shorthand", async () => {
  const { result } = await runWorkflow(script("adrift.js"), {
    args: "0061, 0073",
    stubs: { agent: adriftWithDr },
  });
  assert.match(
    String(result && result.why),
    /focus \[0061, 0073\]/,
    "adrift read the id list as a directory instead of narrowing by focus",
  );
});
