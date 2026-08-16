import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.js");

// exists and trackedFiles are injected so the decision logic alone is verified against fixed
// fixtures without touching the real fs or git ls-files; check-index.cli.test.js covers the
// argv and git wiring.

test("a row whose reference path does not exist is reported as dangling-path and the exit code is non-zero", async () => {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.tsx | component conventions | docs/does-not-exist.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: (path) => path !== "docs/does-not-exist.md",
    trackedFiles: ["src/button.tsx"],
  });

  assert.equal(result.dangling.length, 1);
  assert.equal(result.dangling[0].path, "docs/does-not-exist.md");
  assert.notEqual(result.exitCode, 0);
});

test("a glob row matching no tracked file is reported as a no-match warning", async () => {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.foo | an extension that matches nothing | docs/existing.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/button.tsx"],
  });

  assert.equal(result.noMatch.length, 1);
  assert.equal(result.noMatch[0].glob, "src/*.foo");
  assert.equal(result.dangling.length, 0);
  assert.equal(result.exitCode, 0);
});

test("a `-` row and a row with an unsupported metacharacter are not reported as drift, and the unsupported one is listed separately", async () => {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| - | an unconditional candidate; read it at your discretion | docs/candidate.md |",
    "| src/** | a bare double star is unsupported | docs/unsupported.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/anything.tsx"],
  });

  assert.equal(result.dangling.length, 0);
  assert.equal(result.noMatch.length, 0);
  assert.equal(result.unsupported.length, 1);
  assert.equal(result.unsupported[0].glob, "src/**");
  assert.equal(result.exitCode, 0);
});

test("an index with no drift reports nothing and exits 0", async () => {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.tsx | component conventions | docs/existing.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/button.tsx"],
  });

  assert.equal(result.dangling.length, 0);
  assert.equal(result.noMatch.length, 0);
  assert.equal(result.exitCode, 0);
});
