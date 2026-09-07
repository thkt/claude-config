/// <reference types="node" />
// Behavior tests for extractBracedBody in workflows/_lib/tests/_brace.ts. That helper is the
// shared, non-eval oracle meta-contract.test.js and run-workflow.test.ts use to pull a top-level
// `<marker>{ ... }` object literal out of workflow-script source. This file pins the boundary
// case parseStringArrayConst already guards (an unclosed literal reports null, not a slice built
// from a sentinel index) and the balanced case the depth-count relies on (brace pairs nested
// inside a string value stay balanced, so the scan still lands on the real closing brace).
import assert from "node:assert/strict";
import test from "node:test";
import { extractBracedBody } from "./_brace.ts";

test("T-048 extractBracedBody returns null when the brace opened after the marker never closes", () => {
  const source = 'const meta = { "name": "audit", "phases": [';
  assert.strictEqual(extractBracedBody(source, "const meta = {"), null);
});

test("T-049 extractBracedBody returns the inner text of a balanced literal whose string values carry nested braces", () => {
  const source = 'const meta = { "description": "Workflow({name:\'audit\'})" };';
  assert.strictEqual(
    extractBracedBody(source, "const meta = {"),
    ' "description": "Workflow({name:\'audit\'})" ',
  );
});
