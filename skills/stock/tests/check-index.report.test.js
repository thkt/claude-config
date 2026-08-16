import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.js");

// result.size renders DR-0091's "watch an index that outgrows one screen as a sign of
// over-injection" as a line-count threshold.

test("the size warning stays down through 30 table rows and rises at 31", async () => {
  const { checkIndex } = await import(scriptPath);
  const header = ["| glob | description | path |", "| --- | --- | --- |"];
  const tableOf = (dataRowCount) =>
    [
      ...header,
      ...Array.from(
        { length: dataRowCount },
        (_, i) => `| src/*.tsx | convention ${i} | docs/existing.md |`,
      ),
    ].join("\n");
  const deps = { exists: () => true, trackedFiles: ["src/button.tsx"] };

  const atThreshold = checkIndex({ table: tableOf(28), ...deps });
  assert.equal(atThreshold.size.lines, 30);
  assert.equal(atThreshold.size.warning, false);

  const overThreshold = checkIndex({ table: tableOf(29), ...deps });
  assert.equal(overThreshold.size.lines, 31);
  assert.equal(overThreshold.size.warning, true);
});

test("prose lines around the table do not count toward size", async () => {
  // What DR-0091 watches is the size of the index table. code.js's reader extracts the table body
  // alone as well, so only the rows starting with `|` are counted rather than every line.
  const { checkIndex } = await import(scriptPath);
  const prose = ["# REFERENCE_INDEX", "", "Explanatory prose sits around the table.", ""];
  const tableLines = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.tsx | conventions | docs/existing.md |",
  ];
  const table = [...prose, ...tableLines, "", "Trailing prose."].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/button.tsx"],
  });

  assert.equal(result.size.lines, tableLines.length);
});

test("the audited index file itself never lands in unreferenced", async () => {
  // An index cannot list itself in its own path column, so without the exclusion it would stay
  // unreferenced forever.
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.tsx | component conventions | docs/referenced.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/button.tsx", "docs/referenced.md", "docs/REFERENCE_INDEX.md"],
    indexPath: "docs/REFERENCE_INDEX.md",
  });

  assert.deepEqual(result.unreferenced, []);
});

test("docs that are not conventions for the implementation agent drop out of the candidates", async () => {
  // A decision record is the history of a past judgment; handing it over at implementation time
  // would eat the one-screen threshold immediately.
  const { checkIndex } = await import(scriptPath);
  const table = ["| glob | description | path |", "| --- | --- | --- |"].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: [
      "docs/decisions/0091-adopt-flat-index.md",
      "docs/decisions/README.md",
      "docs/wiki/_candidates.md",
      "docs/conventions/component-tsx.md",
    ],
  });

  assert.deepEqual(result.unreferenced, ["docs/conventions/component-tsx.md"]);
});

test("an md under docs referenced by no index row is listed as unreferenced", async () => {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.tsx | component conventions | docs/referenced.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/button.tsx", "docs/referenced.md", "docs/orphan.md"],
  });

  assert.deepEqual(result.unreferenced, ["docs/orphan.md"]);
});
