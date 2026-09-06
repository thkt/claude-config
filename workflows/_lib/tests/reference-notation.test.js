// A bare $HOME/.claude path to a bundled asset resolves in the dev tree alone, and the failure
// surfaces only on a machine that installed the harness as a plugin, which no other test here
// exercises. rules/conventions/WORKFLOWS.md § Reference notation carries the rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Copied as-is from meta-contract.test.js's WORKFLOW_TREE_DIRS, so both files enumerate the
// identical two trees. .ja/ is canonical (rules/conventions/MIRROR.md), so a scan over the
// English tree alone leaves the side that is edited first unguarded.
const WORKFLOW_TREE_DIRS = [
  { label: "en", dir: join(here, "..", "..") },
  { label: "ja", dir: join(here, "..", "..", "..", ".ja", "workflows") },
];

const scriptsIn = (dir) => readdirSync(dir).filter((name) => name.endsWith(".js"));

const scripts = WORKFLOW_TREE_DIRS.flatMap(({ label, dir }) =>
  scriptsIn(dir).map((name) => ({ label, dir, name })),
);

// settings.json and the history/ output directory belong to the running side rather than
// the distribution, so the same path holds under a plugin install.
const RUNNING_SIDE = /\$HOME\/\.claude\/(settings\.json|history\/)/;
// The bundled() definition interpolates the relative path, which makes it the one line
// that spells the dev-tree prefix on purpose.
const BUNDLED_DEFINITION = /\$\{rel\}/;

const bareAssetPathsIn = (dir, name) =>
  readFileSync(join(dir, name), "utf8")
    .split("\n")
    .map((text, index) => ({ line: index + 1, text }))
    .filter(({ text }) => text.includes("$HOME/.claude/"))
    .filter(({ text }) => !RUNNING_SIDE.test(text) && !BUNDLED_DEFINITION.test(text))
    .map(({ line, text }) => `${name}:${line} ${text.trim()}`);

// A plugin distribution carries the .ja/ tree alongside the English one, and the search order
// does not guarantee the English copy comes last, so without the exclusion an asset resolves to
// its Japanese copy.
const JA_EXCLUSION = /-not -path "\*\/\.ja\/\*"/;

test("bundled() excludes the .ja copy from its search", () => {
  const definitions = scripts
    .map((script) => ({ ...script, source: readFileSync(join(script.dir, script.name), "utf8") }))
    .filter(({ source }) => source.includes("const bundled ="));
  assert.ok(definitions.length > 0, "found no bundled() definition to check");
  for (const { label, name, source } of definitions) {
    assert.match(
      source,
      JA_EXCLUSION,
      `[${label}] ${name} defines bundled() without the .ja exclusion`,
    );
  }
});

test("workflow scripts reach bundled assets through bundled()", () => {
  assert.ok(scripts.length > 0, "found no workflow script to check");
  for (const { label, dir, name } of scripts) {
    assert.deepEqual(
      bareAssetPathsIn(dir, name),
      [],
      `[${label}] ${name} names a bundled asset by a bare $HOME/.claude path, which a plugin install cannot resolve`,
    );
  }
});

test("T-046 the scan lists the same set of workflow script names under workflows/and .ja/workflows/, compared as names rather than counts", () => {
  const [en, ja] = WORKFLOW_TREE_DIRS.map(({ dir }) => scriptsIn(dir).sort());
  // A count match alone would pass two trees holding the same number of differently named
  // scripts, so the comparison is over the actual name sets rather than their sizes.
  assert.deepEqual(en, ja, "workflows/ and .ja/workflows/ list a different set of script names");
});

// The .ja tree passes both checks today, so the Red for the two-tree scan has to come from a
// fixture: a script carrying the bare path is reported, and the same script rewritten through
// bundled() is not (docs/wiki/absence-test-positive-control-fixture.md).
test("T-047 the scan reports a fixture script carrying a bare $HOME/.claude asset path, and reports nothing once that path is rewritten through bundled()", () => {
  const dir = mkdtempSync(join(tmpdir(), "reference-notation-fixture-"));
  try {
    const barePathName = "fixture-bare-path.js";
    writeFileSync(
      join(dir, barePathName),
      'const asset = "$HOME/.claude/workflows/fixture/asset.py";\n',
    );
    assert.notDeepEqual(
      bareAssetPathsIn(dir, barePathName),
      [],
      `${barePathName} names a bundled asset by a bare $HOME/.claude path, and the scan should report it`,
    );

    const bundledName = "fixture-bundled.js";
    writeFileSync(
      join(dir, bundledName),
      'const asset = `${bundled("workflows/fixture/asset.py")}`;\n',
    );
    assert.deepEqual(
      bareAssetPathsIn(dir, bundledName),
      [],
      `${bundledName} reaches the asset through bundled(), so the scan should report nothing`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
