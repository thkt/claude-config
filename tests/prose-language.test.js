// MIRROR.md names test names in its prose-language rule, and nothing enforced it: node --test and
// oxlint do not read the language of a string, and textlint's target is `.ja/**/*.md` (#423).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);

// Full-width punctuation is left out: it appears inside quoted data a test matches against,
// which MIRROR.md keeps in its original language.
const JAPANESE = /[぀-ゟ゠-ヿ一-龯]/;

// git ls-files, not a directory walk: an untracked scratch file is not what the rule governs.
const trackedTests = async () => {
  const { stdout } = await run("git", ["ls-files", "*.test.js", "*.test.ts"], { cwd: root });
  return stdout.split("\n").filter((p) => p.trim() && !p.startsWith(".ja/"));
};

// Every registration form the runner accepts, in any of the three quote characters. A template
// literal carrying an interpolation is read as its raw source, which is enough to spot the
// language; evaluating it would need the surrounding scope.
const REGISTRATION = /^\s*(?:test|it|describe)(?:\.\w+)?\(\s*(["'`])((?:[^\\]|\\.)*?)\1/gm;
export const testNames = (source) => [...source.matchAll(REGISTRATION)].map((m) => m[2]);

test("no test on the English side is named in Japanese", async () => {
  const offenders = [];
  for (const path of await trackedTests()) {
    const source = await readFile(join(root, path), "utf8");
    for (const name of testNames(source)) {
      if (JAPANESE.test(name)) offenders.push(`${path} :: ${name}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `MIRROR.md keeps test names English outside .ja/. Rename these:\n${offenders.join("\n")}`,
  );
});

// /think turns tests[].name into the test name as written, so a Japanese T-NNN lands a Japanese
// test name from an implementer following instructions. The rule has to reach the plan.
test("the id-numbering reference tells a plan to write T-NNN in English", async () => {
  for (const path of [
    join(root, "skills", "think", "references", "id-numbering.md"),
    join(root, ".ja", "skills", "think", "references", "id-numbering.md"),
  ]) {
    const doc = await readFile(path, "utf8");
    assert.match(doc, /MIRROR\.md/, `${path} points at the rule that owns the prose language`);
  }
});

// The sweep is only as wide as this extractor. It missed two single-quoted names already in the
// tree (build.behavior.test.js), so a Japanese name written in any form below passed unseen.
test("testNames reads every registration form, not just a double-quoted test()", () => {
  const source = [
    'test("double quoted", () => {});',
    "test('single quoted', () => {});",
    'test.skip("skipped", () => {});',
    "test.only('only', () => {});",
    "test.todo(`todo`, () => {});",
    "it('it form', () => {});",
    'describe("describe form", () => {});',
    '  test("indented", () => {});',
  ].join("\n");
  assert.deepEqual(testNames(source).sort(), [
    "describe form",
    "double quoted",
    "indented",
    "it form",
    "only",
    "single quoted",
    "skipped",
    "todo",
  ]);
});
