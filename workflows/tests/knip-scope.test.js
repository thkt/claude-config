// What tsconfig.json and knip.json each put in scope, read via tsc --showConfig (the resolved
// include/exclude, comments stripped by tsc itself) and a plain JSON.parse of knip.json, rather
// than reimplementing tsconfig's comment/resolution handling here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..", "..");
const TSC_BIN = path.join(ROOT, "node_modules", ".bin", "tsc");
const TSCONFIG = path.join(ROOT, "tsconfig.json");
const KNIP_JSON = path.join(ROOT, "knip.json");

let cachedTsconfig;
function readTsconfig() {
  if (cachedTsconfig) return cachedTsconfig;
  assert.ok(
    existsSync(TSC_BIN),
    `${TSC_BIN} is missing: run the repository's install step (bun install) before this suite`,
  );
  const output = execFileSync(TSC_BIN, ["-p", TSCONFIG, "--showConfig"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  cachedTsconfig = JSON.parse(output);
  return cachedTsconfig;
}

function readKnip() {
  return JSON.parse(readFileSync(KNIP_JSON, "utf8"));
}

// A glob's top-level directory name, with a leading ".ja/" mirror prefix dropped so an EN-tree
// glob and its .ja mirror both name the same directory (e.g. ".ja/skills/**" -> "skills").
function topDir(glob) {
  const segments = glob.split("/");
  return segments[0] === ".ja" ? segments[1] : segments[0];
}

test("T-051 every directory named by tsconfig.json include is matched by a knip.json project glob, compared as a set of directory names", () => {
  const { include } = readTsconfig();
  const { project } = readKnip();
  const tsconfigDirs = new Set(include.map(topDir));
  const knipDirs = new Set(project.map(topDir));
  for (const dir of tsconfigDirs) {
    assert.ok(
      knipDirs.has(dir),
      `tsconfig.json include names directory "${dir}", which no knip.json project glob matches (project: ${JSON.stringify(project)})`,
    );
  }
});

test("T-052 knip.json ignoreFiles carries every pattern tsconfig.json exclude names", () => {
  const { exclude } = readTsconfig();
  const { ignoreFiles } = readKnip();
  for (const pattern of exclude) {
    assert.ok(
      ignoreFiles.includes(pattern),
      `tsconfig.json exclude names "${pattern}", which knip.json ignoreFiles does not carry (ignoreFiles: ${JSON.stringify(ignoreFiles)})`,
    );
  }
});
