// What tsconfig.json puts in the type-check set, read by running tsc rather than by
// reimplementing its include/exclude resolution here. --listFilesOnly is tsc's own option for
// printing the files a compile would take and then exiting (confirmed via `tsc --help --all`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..", "..");
const TSC_BIN = path.join(ROOT, "node_modules", ".bin", "tsc");
const TSCONFIG = path.join(ROOT, "tsconfig.json");
// The fixture both tests read. Committed rather than written per run: the sandbox denies
// writes under workflows/, so creating it at test time fails with EPERM.
const FIXTURE = "workflows/tests/fixtures/tsconfig-scope-fixture.ts";

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

// tsc compiles the whole project to answer this, so it runs once for the file rather than
// once per test.
let cached;
function listTypeCheckedFiles() {
  if (cached) return cached;
  assert.ok(
    existsSync(TSC_BIN),
    `${TSC_BIN} is missing: run the repository's install step (bun install) before this suite`,
  );
  const output = execFileSync(TSC_BIN, ["-p", TSCONFIG, "--listFilesOnly"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  cached = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(toPosix)
    .filter((file) => !file.includes("/node_modules/"));
  return cached;
}

test("T-001 the type-check set contains no .ts under skills/*/test/cases", () => {
  const files = listTypeCheckedFiles();
  // Positive control first: without it, a resolution that returns nothing at all satisfies the
  // emptiness assertion below and the test reports success on a broken config.
  assert.ok(
    files.some((file) => file.endsWith(FIXTURE)),
    `the resolution returned no ${FIXTURE}, so an empty result below would prove nothing`,
  );
  const skillsTestCaseFiles = files.filter((file) => /\/skills\/[^/]+\/test\/cases\//.test(file));
  assert.deepEqual(skillsTestCaseFiles, []);
});

test("T-002 the type-check set contains the .ts under workflows", () => {
  const files = listTypeCheckedFiles();
  // The fixture by name, not a count: any workflows/ file would satisfy a count while the
  // fixture itself had dropped out of the include.
  assert.ok(
    files.some((file) => file.endsWith(FIXTURE)),
    `${FIXTURE} is not in the type-check set`,
  );
});
