// whenToUse is prose for whoever decides whether to invoke the workflow, not a place to teach
// the args shape (rules/conventions/WORKFLOWS.md). Its focus enum survives that rule only
// because a caller cannot recover it at run time, so these tests hold it to audit.js's FOCUS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMeta } from "../run-workflow.js";
// T-045's own point: this file is `.js`, and the specifier below ends in `.ts`. Node's type
// stripping resolves it the same way it resolves gate.test.ts's `.ts`-to-`.ts` imports; nothing
// in the script evaluation form (rules/conventions/WORKFLOWS.md) constrains module resolution,
// only the vm boundary a workflow script runs inside.
import { runWorkflow } from "../run-workflow.ts";
import { parseRoutingLikeConst } from "./_brace.js";

const here = dirname(fileURLToPath(import.meta.url));

// One entry per <name>.js, in both the English source under workflows/ and its .ja/ mirror.
const workflowTrees = (name) => [
  { label: `${name}/en`, path: join(here, "..", "..", `${name}.js`) },
  { label: `${name}/ja`, path: join(here, "..", "..", "..", ".ja", "workflows", `${name}.js`) },
];

const TREES = workflowTrees("audit");

// Each name gets its own test, so a failure names the workflow rather than a file position
// inside a sweep.
const NAMED_WORKFLOWS = ["adrift", "assert", "audit", "build", "code", "polish", "shake"];

const WORKFLOW_TREE_DIRS = [
  { label: "en", dir: join(here, "..", "..") },
  { label: "ja", dir: join(here, "..", "..", "..", ".ja", "workflows") },
];

// Both fields, not whenToUse alone: rules/conventions/WORKFLOWS.md states the ban over
// description too, and a rule enforced on one field lets the other drift.
const META_PROSE_FIELDS = ["description", "whenToUse"];

for (const name of NAMED_WORKFLOWS) {
  test(`${name}'s meta prose in neither tree contains the identifier args`, () => {
    for (const { label, path } of workflowTrees(name)) {
      const meta = readMeta(path);
      for (const field of META_PROSE_FIELDS) {
        assert.doesNotMatch(
          meta[field],
          /\bargs\b/,
          `[${label}] ${field} names the identifier "args" instead of describing the target in prose`,
        );
      }
    }
  });
}

// Holds the list itself to the tree rather than re-asserting the property: a workflow added
// later fails here until it is named, instead of slipping past unchecked.
test("no meta prose under either tree contains the identifier args", () => {
  for (const { label, dir } of WORKFLOW_TREE_DIRS) {
    const scripts = readdirSync(dir)
      .filter((name) => name.endsWith(".js"))
      .map((name) => name.replace(/\.js$/, ""))
      .sort();
    assert.deepEqual(
      scripts,
      [...NAMED_WORKFLOWS].sort(),
      `[${label}] every workflow carries a named meta-prose test; this tree holds one that does not`,
    );
  }
});

// Only the key set matters here: FOCUS's values are reviewer-name arrays that whenToUse's prose
// never restates.
const focusKeys = (source) => {
  const focus = parseRoutingLikeConst(source, "FOCUS");
  return focus && Object.keys(focus);
};

// Not the spelling copied into the test: extracting the list from the prose lets either side
// drift alone and still be caught.
const focusValuesInWhenToUse = (whenToUse) => {
  const m = /focus \(([^)]+)\)/.exec(whenToUse);
  if (!m) return null;
  return m[1].split("/").map((s) => s.trim());
};

test("the focus values in audit's whenToUse match the FOCUS keys extracted from audit.js in both trees", () => {
  for (const { label, path } of TREES) {
    const source = readFileSync(path, "utf8");
    const keys = focusKeys(source);
    assert.ok(keys, `[${label}] FOCUS is extractable from ${path}`);

    const meta = readMeta(path);
    const proseValues = focusValuesInWhenToUse(meta.whenToUse);
    assert.ok(
      proseValues,
      `[${label}] whenToUse names its valid focus values as "focus (a / b / ...)"`,
    );

    assert.deepEqual(
      new Set(proseValues),
      new Set(keys),
      `[${label}] whenToUse's focus values and audit.js's FOCUS keys diverge`,
    );
  }
});

const POLISH_TREES = workflowTrees("polish");

// Only the key set matters here: MODES's values are null placeholders that whenToUse's prose
// never restates.
const modeKeys = (source) => {
  const modes = parseRoutingLikeConst(source, "MODES");
  return modes && Object.keys(modes);
};

// Not the spelling copied into the test: extracting the list from the prose lets either side
// drift alone and still be caught.
const modeValuesInWhenToUse = (whenToUse) => {
  const m = /mode \(([^)]+)\)/.exec(whenToUse);
  if (!m) return null;
  return m[1].split("/").map((s) => s.trim());
};

test("the mode values in polish's whenToUse match the MODES entries extracted from polish.js in both trees", () => {
  for (const { label, path } of POLISH_TREES) {
    const source = readFileSync(path, "utf8");
    const keys = modeKeys(source);
    assert.ok(keys, `[${label}] MODES is extractable from ${path}`);

    const meta = readMeta(path);
    const proseValues = modeValuesInWhenToUse(meta.whenToUse);
    assert.ok(
      proseValues,
      `[${label}] whenToUse names its valid mode values as "mode (a / b / ...)"`,
    );

    assert.deepEqual(
      new Set(proseValues),
      new Set(keys),
      `[${label}] whenToUse's mode values and polish.js's MODES keys diverge`,
    );
  }
});

// T-045: run-workflow.ts's Green-step scaffold does not evaluate the script yet (it always
// returns `undefined`), so this fails on the concrete result rather than on a module-resolution
// or parse error -- the failure that names T-045 is the intended Red evidence for the `.js`-to-
// `.ts` import path itself, ported behavior is out of scope for this unit's Red step.
test("T-045 a .js test importing runWorkflow from run-workflow.ts evaluates a workflow script and returns its result", async () => {
  const dir = mkdtempSync(join(tmpdir(), "meta-contract-ts-import-"));
  const scriptPath = join(dir, "script.js");
  writeFileSync(scriptPath, "return { via: 'run-workflow.ts' };");
  try {
    const { result } = await runWorkflow(scriptPath, {});
    assert.deepEqual(result, { via: "run-workflow.ts" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
