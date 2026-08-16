import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initRepo, commitAll } from "./_git-fixture.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.js");

// These connect the decisions the other tests turned green individually into one run of the child
// process against a real git repository. Each category keeps its own unit verification elsewhere.

// execFileSync throws on a non-zero exit, so it cannot verify the exit code itself. spawnSync
// returns the code as status, which receives 0 and non-zero in the same shape.
function runCli(repoRootArg, indexPath, cwd) {
  const result = spawnSync("node", [scriptPath, repoRootArg, indexPath], {
    cwd,
    encoding: "utf8",
  });
  return { status: result.status, json: JSON.parse(result.stdout) };
}

test("one run against a fixture carrying dangling, no-match, unsupported, unreferenced, and size at once returns every category at its expected count", () => {
  const dir = initRepo("e2e");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });

  // For dangling: the glob matches a tracked file so it stays out of noMatch, and the path names a
  // file that does not exist so dangling arises on its own.
  writeFileSync(join(dir, "src", "a.tsx"), "export const A = () => null;\n");
  // Exists as the target for the no-match and unsupported rows.
  writeFileSync(join(dir, "docs", "existing.md"), "# existing\n");
  // An md under docs referenced by no row, expected to be picked up as unreferenced.
  writeFileSync(join(dir, "docs", "orphan.md"), "# orphan\n");

  const header = ["| glob | description | path |", "| --- | --- | --- |"];
  const dangling = ["| src/a.tsx | the dangling case | docs/missing-target.md |"];
  const noMatch = ["| src/nomatch.foo | the no-match case | docs/existing.md |"];
  const unsupported = ["| src/** | the unsupported case (a bare double star) | docs/existing.md |"];
  // The CLI excludes the index file itself through indexPath, so no self-referencing row is needed.
  // These padding rows push past the size warning threshold (30 rows, DR-0091). Their glob stays
  // `-` so they do not affect the drift decision.
  const padding = Array.from({ length: 30 }, (_, i) => `| - | padding ${i} | docs/existing.md |`);
  const table = [...header, ...dangling, ...noMatch, ...unsupported, ...padding].join("\n");
  const indexPath = join(dir, "docs", "REFERENCE_INDEX.md");
  writeFileSync(indexPath, table);
  commitAll(dir);

  const { status, json } = runCli(".", indexPath, dir);

  assert.equal(json.dangling.length, 1);
  assert.equal(json.dangling[0].path, "docs/missing-target.md");
  assert.equal(json.noMatch.length, 1);
  assert.equal(json.noMatch[0].glob, "src/nomatch.foo");
  assert.equal(json.unsupported.length, 1);
  assert.equal(json.unsupported[0].glob, "src/**");
  assert.deepEqual(json.unreferenced, ["docs/orphan.md"]);
  // Two header rows plus three checked rows plus thirty padding rows.
  assert.equal(json.size.lines, 35);
  assert.equal(json.size.warning, true);
  assert.notEqual(status, 0);
  assert.equal(json.exitCode, status);
});

test("a repository with no index does not die and returns found: false with the indexing candidates", () => {
  // Indexing starts from a state where no index exists yet. Dying here would block the backfill.
  const dir = initRepo("e2e");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "convention.md"), "# convention\n");
  commitAll(dir);

  const { status, json } = runCli(".", join(dir, "docs", "REFERENCE_INDEX.md"), dir);

  assert.equal(json.found, false);
  assert.deepEqual(json.unreferenced, ["docs/convention.md"]);
  assert.equal(json.dangling.length, 0);
  assert.equal(json.size.lines, 0);
  assert.equal(status, 0);
});

test("two fixtures differing only in whether a dangling row exists split the exit code into 0 and non-zero", () => {
  function buildFixture({ withDangling }) {
    const dir = initRepo("e2e");
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "src", "a.tsx"), "export const A = () => null;\n");
    if (!withDangling) {
      writeFileSync(join(dir, "docs", "target.md"), "# target\n");
    }
    const indexPath = join(dir, "docs", "REFERENCE_INDEX.md");
    writeFileSync(
      indexPath,
      [
        "| glob | description | path |",
        "| --- | --- | --- |",
        "| src/a.tsx | toggles whether a dangling row exists | docs/target.md |",
      ].join("\n"),
    );
    commitAll(dir);
    return { dir, indexPath };
  }

  const withDangling = buildFixture({ withDangling: true });
  const withoutDangling = buildFixture({ withDangling: false });

  const danglingResult = runCli(".", withDangling.indexPath, withDangling.dir);
  const cleanResult = runCli(".", withoutDangling.indexPath, withoutDangling.dir);

  assert.notEqual(danglingResult.status, 0);
  assert.equal(cleanResult.status, 0);
});
