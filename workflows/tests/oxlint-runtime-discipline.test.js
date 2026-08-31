// Whether the repository's own `.oxlintrc.json` is wired to catch Bun-runtime-specific code in
// `.ts` files, read by running oxlint rather than by reimplementing its rule matching here.
//
// The fixtures are written into a temp directory rather than committed. CI runs `npx oxlint`
// bare at the repository root, so a tracked file carrying the violation would keep that step
// red forever; and `ignorePatterns` wins over an explicit path argument, so parking them under
// an ignored path would leave the lint below with nothing to read. The config is copied from
// disk so the rule text lives in one place.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..", "..");
const OXLINT_BIN = path.join(ROOT, "node_modules", ".bin", "oxlint");
const OXLINTRC = path.join(ROOT, ".oxlintrc.json");

// T-001's positive control: a bare `Bun` global reference.
const BUN_GLOBAL = `export function readConfig() {
  return Bun.file("config.json");
}
`;

// T-002: BUN_GLOBAL with its only `Bun` clue removed, per
// docs/wiki/absence-test-positive-control-fixture.md's copy-minus-clue step. A non-zero exit on
// BUN_GLOBAL is credited to the `Bun` reference only if this shape stays at zero.
const BUN_GLOBAL_REMOVED = `const config = { file: (name) => name };

export function readConfig() {
  return config.file("config.json");
}
`;

// T-003's positive control: a `bun:*` import specifier, the second shape the rules name.
const BUN_SPECIFIER = `import { file } from "bun:test";

export function useFile() {
  return file;
}
`;

// T-004, per the same page's step 3: a pattern-list check is also tried against violation
// shapes the list does not name. Property access and a dynamic require are this check's blind
// spot, so this shape is expected to stay unflagged rather than to prove the rules catch all.
const BUN_OBFUSCATED = `export function readEnv() {
  const a = globalThis.Bun.env;
  const b = globalThis["Bun"].file("x");
  const sqlite = require("bun:sqlite");
  return { a, b, sqlite };
}
`;

// oxlint exits non-zero only when a configured rule fires on the given file, so each fixture's
// exit code, not its stdout, is what this suite reads. One directory serves every case, and
// each fixture is linted once, mirroring tsconfig-scope.test.js's listTypeCheckedFiles.
let workspace;
const cache = new Map();

function lint(name, source) {
  if (cache.has(name)) return cache.get(name);
  assert.ok(
    existsSync(OXLINT_BIN),
    `${OXLINT_BIN} is missing: run the repository's install step (bun install) before this suite`,
  );
  if (!workspace) {
    workspace = mkdtempSync(path.join(tmpdir(), "oxlint-runtime-"));
    copyFileSync(OXLINTRC, path.join(workspace, ".oxlintrc.json"));
  }
  const file = `${name}.ts`;
  writeFileSync(path.join(workspace, file), source, "utf8");
  let exitCode = 0;
  try {
    execFileSync(OXLINT_BIN, ["-c", ".oxlintrc.json", file], { cwd: workspace, encoding: "utf8" });
  } catch (error) {
    exitCode = typeof error.status === "number" ? error.status : 1;
  }
  cache.set(name, exitCode);
  return exitCode;
}

test.after(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
});

test("T-001 a .ts calling Bun.file() exits non-zero under the repository's oxlint config", () => {
  assert.notEqual(lint("bun-global", BUN_GLOBAL), 0);
});

test("T-002 the same source with its Bun reference removed exits zero", () => {
  assert.equal(lint("bun-global-removed", BUN_GLOBAL_REMOVED), 0);
});

test('T-003 a .ts importing from "bun:test" exits non-zero under the repository\'s oxlint config', () => {
  assert.notEqual(lint("bun-specifier", BUN_SPECIFIER), 0);
});

test('T-004 a .ts reaching Bun through globalThis or require("bun:sqlite") exits zero', () => {
  assert.equal(lint("bun-obfuscated", BUN_OBFUSCATED), 0);
});
