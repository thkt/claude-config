// A workflow script must reach a bundled asset through bundled(), so that an install
// under ~/.claude/plugins resolves it. A bare $HOME/.claude path resolves in the dev tree
// alone, and the failure surfaces only on a machine that installed the harness as a
// plugin, which no other test in this repository exercises. The rule this guards lives in
// rules/conventions/WORKFLOWS.md under Reference notation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workflowsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// settings.json and the history/ output directory belong to the running side rather than
// the distribution, so the same path holds under a plugin install.
const RUNNING_SIDE = /\$HOME\/\.claude\/(settings\.json|history\/)/;
// The bundled() definition interpolates the relative path, which makes it the one line
// that spells the dev-tree prefix on purpose.
const BUNDLED_DEFINITION = /\$\{rel\}/;

const scripts = readdirSync(workflowsDir).filter((name) => name.endsWith(".js"));

const bareAssetPaths = (name) =>
  readFileSync(join(workflowsDir, name), "utf8")
    .split("\n")
    .map((text, index) => ({ line: index + 1, text }))
    .filter(({ text }) => text.includes("$HOME/.claude/"))
    .filter(({ text }) => !RUNNING_SIDE.test(text) && !BUNDLED_DEFINITION.test(text))
    .map(({ line, text }) => `${name}:${line} ${text.trim()}`);

// A plugin distribution carries the .ja/ tree alongside the English one, and sort -V puts
// the .ja entry last, so the search has to exclude it or every asset resolves to its
// Japanese copy.
const JA_EXCLUSION = /-not -path "\*\/\.ja\/\*"/;

test("bundled() excludes the .ja copy from its search", () => {
  const definitions = scripts
    .map((name) => ({ name, source: readFileSync(join(workflowsDir, name), "utf8") }))
    .filter(({ source }) => source.includes("const bundled ="));
  assert.ok(definitions.length > 0, "found no bundled() definition to check");
  for (const { name, source } of definitions) {
    assert.match(source, JA_EXCLUSION, `${name} defines bundled() without the .ja exclusion`);
  }
});

test("workflow scripts reach bundled assets through bundled()", () => {
  assert.ok(scripts.length > 0, "found no workflow script to check");
  for (const name of scripts) {
    assert.deepEqual(
      bareAssetPaths(name),
      [],
      `${name} names a bundled asset by a bare $HOME/.claude path, which a plugin install cannot resolve`,
    );
  }
});
