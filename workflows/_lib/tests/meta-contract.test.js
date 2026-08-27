// whenToUse is prose for whoever decides whether to invoke the workflow, not a place to teach
// the args shape (rules/conventions/WORKFLOWS.md). Its focus enum survives that rule only
// because a caller cannot recover it at run time, so these tests hold it to audit.js's FOCUS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMeta } from "../run-workflow.js";
import { parseRoutingLikeConst } from "./_brace.js";

const here = dirname(fileURLToPath(import.meta.url));

// One entry per <name>.js, in both the English source under workflows/ and its .ja/ mirror.
// Shared by the focus-values test (audit only) and the no-args-identifier check (all three).
const workflowTrees = (name) => [
  { label: `${name}/en`, path: join(here, "..", "..", `${name}.js`) },
  { label: `${name}/ja`, path: join(here, "..", "..", "..", ".ja", "workflows", `${name}.js`) },
];

const TREES = workflowTrees("audit");

test("whenToUse in neither tree names the identifier args, for audit/build/code", () => {
  for (const name of ["audit", "build", "code"]) {
    for (const { label, path } of workflowTrees(name)) {
      const meta = readMeta(path);
      assert.doesNotMatch(
        meta.whenToUse,
        /\bargs\b/,
        `[${label}] whenToUse names the identifier "args" instead of describing the shape in prose`,
      );
    }
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

