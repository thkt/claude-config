import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initRepo, commitAll } from "./_git-fixture.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.js");

// These stand up a real git repository and start the CLI process, checking that the repo root and
// index path it resolves from argv agree with git's state; check-index.test.js covers the
// decision logic on its own.

function runCli(repoRootArg, indexPath, cwd) {
  const stdout = execFileSync("node", [scriptPath, repoRootArg, indexPath], {
    cwd,
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

test("starting from a subdirectory returns the same report as starting from the repo root", () => {
  const dir = initRepo("cli");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  mkdirSync(join(dir, "sub"), { recursive: true });
  writeFileSync(join(dir, "src", "button.tsx"), "export const Button = () => null;\n");
  writeFileSync(join(dir, "docs", "reference.md"), "# reference\n");
  const indexPath = join(dir, "docs", "REFERENCE_INDEX.md");
  writeFileSync(
    indexPath,
    [
      "| glob | description | path |",
      "| --- | --- | --- |",
      "| src/*.tsx | button conventions | docs/reference.md |",
    ].join("\n"),
  );
  commitAll(dir);

  const fromRoot = runCli(".", indexPath, dir);
  const fromSubdir = runCli(".", indexPath, join(dir, "sub"));

  assert.deepEqual(fromSubdir, fromRoot);
});

test("a file outside git's control is not matched against the globs", () => {
  const dir = initRepo("cli");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "reference.md"), "# reference\n");
  const indexPath = join(dir, "docs", "REFERENCE_INDEX.md");
  // The glob matches widget.tsx alone. widget.tsx is placed on disk but never git added, so it
  // stays untracked and no row's target exists in the tracked file list (git ls-files).
  writeFileSync(
    indexPath,
    [
      "| glob | description | path |",
      "| --- | --- | --- |",
      "| src/widget.tsx | an untracked file | docs/reference.md |",
    ].join("\n"),
  );
  commitAll(dir);

  writeFileSync(join(dir, "src", "widget.tsx"), "export const Widget = () => null;\n");

  const result = runCli(".", indexPath, dir);

  assert.equal(result.dangling.length, 0);
  assert.equal(result.noMatch.length, 1);
  assert.equal(result.noMatch[0].glob, "src/widget.tsx");
});
