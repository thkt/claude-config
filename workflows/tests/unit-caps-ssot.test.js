// A number that moved in the script and not in the prose sends /think to draft plans build then
// rejects as oversized.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const read = (relative) => readFileSync(join(root, relative), "utf8");

// build.js is evaluated in the harness's own context, so it exposes no export to import.
const capsIn = (relative) => {
  const source = read(relative);
  const match = source.match(/const UNIT_CAPS = \{ files: (\d+), tests: (\d+) \};/);
  assert.ok(match, `${relative} carries no UNIT_CAPS literal in the expected shape`);
  return { files: Number(match[1]), tests: Number(match[2]) };
};

const CANONICAL = "workflows/build.js";

test("the caps the canonical declares are the caps the script actually enforces", () => {
  const caps = capsIn(CANONICAL);
  const source = read(CANONICAL);
  assert.match(
    source,
    /fileCount > UNIT_CAPS\.files \|\| testCount > UNIT_CAPS\.tests/,
    "the oversized-unit check reads both caps from the constant",
  );
  assert.ok(caps.files > 0 && caps.tests > 0, "both caps are positive");
});

test("the .ja mirror of the canonical carries the same caps", () => {
  assert.deepEqual(
    capsIn(".ja/workflows/build.js"),
    capsIn(CANONICAL),
    "the mirrored build.js states different caps from the English one",
  );
});

for (const skill of ["skills/think/SKILL.md", ".ja/skills/think/SKILL.md"]) {
  test(`${skill} states the caps the canonical owns`, () => {
    const { files, tests } = capsIn(CANONICAL);
    const source = read(skill);
    assert.ok(
      new RegExp(`files ${files}`).test(source) || new RegExp(`${files} files`).test(source),
      `${skill} does not state the ${files}-file cap that ${CANONICAL} enforces`,
    );
    assert.ok(
      new RegExp(`tests ${tests}`).test(source) || new RegExp(`${tests} tests`).test(source),
      `${skill} does not state the ${tests}-test cap that ${CANONICAL} enforces`,
    );
  });

  test(`${skill} names where the canonical lives`, () => {
    const source = read(skill);
    assert.match(
      source,
      /`UNIT_CAPS`/,
      `${skill} states the caps without naming the constant that owns them`,
    );
    assert.match(
      source,
      /workflows\/build\.js/,
      `${skill} names the constant without naming the file it lives in`,
    );
  });
}
