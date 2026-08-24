// audit's whenToUse is prose read by a human deciding whether to invoke the workflow, not a
// place to teach the args object's shape (rules/conventions/WORKFLOWS.md). U-002 already pins
// that an invalid focus value stops the run; this file pins the prose side: the focus values
// whenToUse lists stay in lockstep with the FOCUS keys audit.js actually branches on, in both
// the English and the .ja/ tree, and the identifier "args" never leaks into the prose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMeta } from "../run-workflow.js";
import { parseRoutingLikeConst } from "./_brace.js";

const here = dirname(fileURLToPath(import.meta.url));

// One tree per audit.js: the English source under workflows/, and its .ja/ mirror.
const TREES = [
  { label: "en", path: join(here, "..", "..", "audit.js") },
  { label: "ja", path: join(here, "..", "..", "..", ".ja", "workflows", "audit.js") },
];

// Only the key set matters here: FOCUS's values are reviewer-name arrays that whenToUse's prose
// never restates.
const focusKeys = (source) => {
  const focus = parseRoutingLikeConst(source, "FOCUS");
  return focus && Object.keys(focus);
};

// whenToUse lists the valid focus values in prose as "focus (all / security / performance /
// quality / a11y)", identically worded across both trees (the Japanese sentence keeps the
// English focus tokens as-is). Extracting the parenthesized, slash-separated list here rather
// than copying its spelling into the test lets T-005 catch either side drifting alone.
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

test("audit's whenToUse in neither tree contains the identifier args", () => {
  for (const { label, path } of TREES) {
    const meta = readMeta(path);
    assert.doesNotMatch(
      meta.whenToUse,
      /\bargs\b/,
      `[${label}] whenToUse names the identifier "args" instead of describing the shape in prose`,
    );
  }
});
