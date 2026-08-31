// What tsconfig.json puts in the type-check set, read by running tsc rather than by
// reimplementing its include/exclude resolution here. --listFilesOnly is tsc's own option for
// printing the files a compile would take and then exiting (confirmed via `tsc --help --all`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..", "..");
const TSC_BIN = path.join(ROOT, "node_modules", ".bin", "tsc");
const TSCONFIG = path.join(ROOT, "tsconfig.json");

// The positive control. Asserting only that the fixtures are excluded stays green even when
// the resolution itself breaks and returns nothing, so a file that must be included is checked
// alongside it. The fixture is committed because the sandbox denies writes under workflows/.

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function listTypeCheckedFiles() {
  const output = execFileSync(TSC_BIN, ["-p", TSCONFIG, "--listFilesOnly"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(toPosix)
    .filter((file) => !file.includes("/node_modules/"));
}

test("T-001 the type-check set contains no .ts under skills/*/test/cases", () => {
  const files = listTypeCheckedFiles();
  const skillsTestCaseFiles = files.filter((file) => /\/skills\/[^/]+\/test\/cases\//.test(file));
  assert.deepEqual(skillsTestCaseFiles, []);
});

test("T-002 the type-check set contains the .ts under workflows", () => {
  const files = listTypeCheckedFiles();
  const workflowsFiles = files.filter((file) => file.includes("/workflows/"));
  assert.ok(workflowsFiles.length > 0);
});
