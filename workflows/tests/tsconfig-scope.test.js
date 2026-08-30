// tsconfig.json's exclude mirrors .oxlintrc.json's ignorePatterns for skills/*/test/cases/**
// (see .oxlintrc.json) instead of inventing a second policy over the same file set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, globSync } from "node:fs";
import { dirname, join, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const readJson = (relative) => JSON.parse(readFileSync(join(root, relative), "utf8"));

// Whether relativePath falls inside the set tsconfig.json actually type-checks: matched by
// at least one include pattern and matched by no exclude pattern.
//
// path.matchesGlob(path, pattern) is stable since Node v24.8.0 / v22.20.0
// (https://nodejs.org/docs/latest/api/path.html#pathmatchesglobpath-pattern), confirmed in
// this session against this repo's own paths (e.g. "skills/*/test/cases/**" matches
// "skills/use-context-reviewer-security/test/cases/safe/env-key.ts").
const isInTypeCheckScope = (tsconfig, relativePath) => {
  const include = tsconfig.include ?? [];
  const exclude = tsconfig.exclude ?? [];
  const included = include.some((pattern) => matchesGlob(relativePath, pattern));
  const excluded = exclude.some((pattern) => matchesGlob(relativePath, pattern));
  return included && !excluded;
};

test("型検査の対象集合が skills/*/test/cases 配下の .ts を 1 件も含まない", () => {
  const tsconfig = readJson("tsconfig.json");
  const candidates = globSync("skills/*/test/cases/**/*.ts", { cwd: root });
  assert.ok(
    candidates.length > 0,
    "no skills/*/test/cases/**/*.ts file exists in this checkout to check the exclusion against",
  );
  const offenders = candidates.filter((relativePath) => isInTypeCheckScope(tsconfig, relativePath));
  assert.deepEqual(
    offenders,
    [],
    `tsconfig.json's type-check target set still contains skills/*/test/cases files: ${offenders.join(", ")}`,
  );
});

test("型検査の対象集合が workflows 配下の .ts を含む", () => {
  const tsconfig = readJson("tsconfig.json");
  const representative = "workflows/tests/tsconfig-scope.representative.ts";
  assert.ok(
    isInTypeCheckScope(tsconfig, representative),
    "tsconfig.json's type-check target set does not include workflows/**/*.ts",
  );
});
