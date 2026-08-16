import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initRepo } from "./_git-fixture.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.js");

// The parser collects the rows starting with `|` and unconditionally skips the first two. With a
// header of any other length it either eats a data row or picks the separator row up as a ghost
// row with the glob "---".
test("with no index present, a table carrying the two header rows and the accepted row is created", async () => {
  const { appendRows } = await import(scriptPath);

  const written = appendRows("", [
    { glob: "src/*.tsx", description: "component conventions", path: "docs/component.md" },
  ]);

  assert.deepEqual(written.trimEnd().split("\n"), [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| `src/*.tsx` | component conventions | docs/component.md |",
  ]);
});

test("a glob is written wrapped in inline code, and both wrapped and bare rows read as the same glob", async () => {
  // Left bare, the markdown formatter reads `*` as an emphasis marker and escapes it, turning
  // `agents/**/*.md` into `agents/\*_/_.md` and leaving every row unmatched. Existing bare rows
  // stay readable for backward compatibility.
  const { appendRows, checkIndex } = await import(scriptPath);

  const written = appendRows("", [
    { glob: "agents/**/*.md", description: "conventions", path: "docs/a.md" },
  ]);
  assert.match(written, /\| `agents\/\*\*\/\*\.md` \|/);

  const bare = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| agents/**/*.md | conventions | docs/a.md |",
  ].join("\n");
  const deps = { exists: () => true, trackedFiles: ["agents/critics/critic-design.md"] };
  assert.equal(
    checkIndex({ table: written, ...deps }).noMatch.length,
    0,
    "the wrapped row matches",
  );
  assert.equal(checkIndex({ table: bare, ...deps }).noMatch.length, 0, "the bare row matches too");
});

test("appending to an existing index does not duplicate the header and keeps the existing rows", async () => {
  const { appendRows } = await import(scriptPath);
  const existing = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.ts | an existing convention | docs/existing.md |",
  ].join("\n");

  const written = appendRows(existing, [
    { glob: "src/*.tsx", description: "an added convention", path: "docs/added.md" },
  ]);

  assert.deepEqual(written.trimEnd().split("\n"), [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.ts | an existing convention | docs/existing.md |",
    "| `src/*.tsx` | an added convention | docs/added.md |",
  ]);
});

test("checking an index written with --apply reads the accepted row back with no drift", () => {
  const dir = initRepo("apply");
  const indexPath = join(dir, "docs", "REFERENCE_INDEX.md");
  const rows = [{ glob: "src/*.tsx", description: "conventions", path: "docs/component.md" }];

  execFileSync("node", [scriptPath, "--apply", indexPath, JSON.stringify(rows)], { cwd: dir });

  // The written table goes straight back through the check to confirm the row reads as one data row.
  const written = readFileSync(indexPath, "utf8");
  const report = JSON.parse(
    execFileSync(
      "node",
      [
        "-e",
        `import("${scriptPath}").then((m) => {
      const r = m.checkIndex({
        table: ${JSON.stringify(written)},
        exists: () => true,
        trackedFiles: ["src/button.tsx"],
      });
      process.stdout.write(JSON.stringify(r));
    })`,
      ],
      { cwd: dir, encoding: "utf8" },
    ),
  );

  assert.equal(report.dangling.length, 0);
  assert.equal(report.noMatch.length, 0);
  assert.equal(report.unsupported.length, 0);
  assert.equal(report.size.lines, 3);
});
