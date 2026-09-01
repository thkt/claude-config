/// <reference types="node" />
// Whether hooks/**'s .ts files sit inside the repository's type-check set and CI's Node tests
// step, and outside both oxlint's ignorePatterns and tsconfig's exclude. Each check runs the
// real tool (tsc, oxlint) and reads its own output, following workflows/tests/tsconfig-
// scope.test.js's listTypeCheckedFiles rather than reimplementing include/exclude/ignore
// resolution here.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..", "..", "..");
const TSC_BIN = path.join(ROOT, "node_modules", ".bin", "tsc");
const TSCONFIG = path.join(ROOT, "tsconfig.json");
const OXLINT_BIN = path.join(ROOT, "node_modules", ".bin", "oxlint");

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

// tsc compiles the whole project to answer this, so it runs once for the file rather than once
// per test. Mirrors workflows/tests/tsconfig-scope.test.js's listTypeCheckedFiles.
let typeCheckedFiles: string[] | undefined;
function listTypeCheckedFiles(): string[] {
  if (typeCheckedFiles) return typeCheckedFiles;
  assert.ok(
    existsSync(TSC_BIN),
    `${TSC_BIN} is missing: run the repository's install step (bun install) before this suite`,
  );
  const output = execFileSync(TSC_BIN, ["-p", TSCONFIG, "--listFilesOnly"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  typeCheckedFiles = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(toPosix)
    .filter((file) => !file.includes("/node_modules/"));
  return typeCheckedFiles;
}

// oxlint's own file discovery, spawned once and cached the same way: reading its output is the
// real ignorePatterns resolution rather than a reimplementation of oxlint's globbing.
// --debug=files is oxlint's own option for printing the files a run would lint and then exiting
// (confirmed via `npx oxlint --help`).
let oxlintFiles: string[] | undefined;
function listOxlintFiles(): string[] {
  if (oxlintFiles) return oxlintFiles;
  assert.ok(
    existsSync(OXLINT_BIN),
    `${OXLINT_BIN} is missing: run the repository's install step (bun install) before this suite`,
  );
  const output = execFileSync(OXLINT_BIN, ["--debug=files", "."], {
    cwd: ROOT,
    encoding: "utf8",
  });
  oxlintFiles = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(toPosix);
  return oxlintFiles;
}

test("T-005 the tsc --listFilesOnly output carries hooks/_lib/hook_payload.ts", () => {
  const files = listTypeCheckedFiles();
  assert.ok(
    files.some((file) => file.endsWith("hooks/_lib/hook_payload.ts")),
    "hooks/_lib/hook_payload.ts is not in the type-check set",
  );
});

// The Python step is a find over the tree, so retiring a *_test.py drops it from CI on its own.
// Adding a .test.ts does not: the Node step names its globs one by one, and a ported test that
// no glob reaches leaves CI green having run nothing.
test("T-006 the Node tests step in .github/workflows/test.yml carries hooks/**/tests/*.test.ts", () => {
  const workflow = readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8");
  const step = workflow.slice(workflow.indexOf("- name: Node tests"));
  assert.ok(step.startsWith("- name: Node tests"), "the Node tests step is missing from test.yml");
  assert.match(step.slice(0, step.indexOf("- name:", 1)), /"hooks\/\*\*\/tests\/\*\.test\.ts"/);
});

// hooks/_lib/hook_payload.ts and its differential test already clear oxlint's ignorePatterns
// today (oxlint has no hooks/ entry to drop them with); the gap is tsconfig's include, which the
// tsc half below exercises through the real compiler instead of a re-implemented glob match.
// Kept as one assertion pair per file so a future ignorePatterns/exclude entry that reintroduces
// a hooks/ drop fails here rather than silently narrowing coverage again.
const HOOKS_TS_FILES = [
  "hooks/_lib/hook_payload.ts",
  "hooks/_lib/tests/hook-payload-parity.test.ts",
];

test("T-007 neither .oxlintrc.json's ignorePatterns nor tsconfig.json's exclude drops hooks/", () => {
  const oxlintSet = listOxlintFiles();
  const tscSet = listTypeCheckedFiles();
  for (const file of HOOKS_TS_FILES) {
    assert.ok(
      oxlintSet.some((entry) => entry.endsWith(file)),
      `oxlint's ignorePatterns dropped ${file}`,
    );
    assert.ok(
      tscSet.some((entry) => entry.endsWith(file)),
      `tsconfig's exclude (or a missing include) dropped ${file}`,
    );
  }
});
