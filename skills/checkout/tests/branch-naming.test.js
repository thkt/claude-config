import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const at = (lang, ...parts) => join(root, ...(lang === "ja" ? [".ja"] : []), "skills", ...parts);
const skills = { ja: at("ja", "checkout", "SKILL.md"), en: at("en", "checkout", "SKILL.md") };
const commits = { ja: at("ja", "commit", "SKILL.md"), en: at("en", "commit", "SKILL.md") };
// The rules themselves sit here so build's Branch phase reads the same ones the skill does.
const naming = {
  ja: at("ja", "checkout", "references", "branch-naming.md"),
  en: at("en", "checkout", "references", "branch-naming.md"),
};

const each = async (paths, check) => {
  for (const [lang, path] of Object.entries(paths)) {
    await check(await readFile(path, "utf8"), lang);
  }
};

const prefixes = (doc) =>
  (doc.match(/^\| ([a-z]+)\/ +\|/gm) || []).map((row) => row.match(/[a-z]+/)[0]);

// Renaming a branch prefix without the commit type stops the same change from becoming a feat
// commit on a feat/ branch and splits the history's types.
test("every branch prefix exists in the commit type table", () =>
  each(naming, async (doc, lang) => {
    const found = prefixes(doc);
    assert.ok(found.length >= 7, `${lang}: seven or more prefixes are readable (${found})`);
    const commitDoc = await readFile(commits[lang], "utf8");
    for (const prefix of found) {
      const row = new RegExp(`^\\| ${prefix} `, "m");
      assert.match(commitDoc, row, `${lang}: commit carries ${prefix}`);
    }
  }));

// A bare git diff shows the staged side as empty, leaving the type to rest on git status alone.
test("reading the changes looks at both the staged and the unstaged side", () =>
  each(skills, (doc, lang) => {
    assert.match(doc, /`git diff HEAD`/, `${lang}: the step names git diff HEAD`);
  }));

// A step citing a section the file no longer carries sends the reader nowhere.
test("every section a step cites exists", () =>
  each(skills, (doc, lang) => {
    const cited = [...doc.matchAll(/\(§ ([^)]+)\)/g)].map((m) => m[1]);
    assert.equal(cited.length, 1, `${lang}: the naming step cites one section`);
    for (const name of cited) {
      assert.match(doc, new RegExp(`^## ${name}$`, "m"), `${lang}: ## ${name} exists`);
    }
  }));

// scribe creates scribe/<yyyymmdd-HHMMSS>, so a date prohibition with no subject would read as a
// repository-wide rule and contradict it.
test("the date prohibition is scoped to the names these rules build", async () => {
  const scoped = {
    ja: /この規則で作る名前に日付は入れない/,
    en: /Names these rules build carry no date/,
  };
  await each(naming, (doc, lang) => {
    assert.match(doc, scoped[lang], `${lang}: the subject is scoped`);
    assert.match(doc, /scribe\/<yyyymmdd-HHMMSS>/, `${lang}: the excepted route is named`);
  });
  assert.match(
    await readFile(at("en", "scribe", "SKILL.md"), "utf8"),
    /scribe\/<yyyymmdd-HHMMSS>/,
    "scribe creates names carrying a date",
  );
});

// build cutting branches its own way puts a second shape of name in the same repository.
test("build's Branch phase assembles the name by these same rules", async () => {
  const reference = "skills/checkout/references/branch-naming.md";
  for (const prefix of ["", ".ja/"]) {
    const buildJs = await readFile(join(root, prefix, "workflows", "build.js"), "utf8");
    assert.ok(
      buildJs.includes(`bundled("${reference}")`),
      `${prefix || "en"}: build reads the naming rules through bundled()`,
    );
  }
  await readFile(join(root, reference), "utf8");
  for (const [lang, path] of Object.entries(skills)) {
    const doc = await readFile(path, "utf8");
    assert.match(
      doc,
      /\$\{CLAUDE_SKILL_DIR\}\/references\/branch-naming\.md/,
      `${lang}: the skill points at the same rules`,
    );
  }
});
