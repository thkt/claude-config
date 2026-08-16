import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "checkout", "SKILL.md"),
  en: join(root, "skills", "checkout", "SKILL.md"),
};
const commits = {
  ja: join(root, ".ja", "skills", "commit", "SKILL.md"),
  en: join(root, "skills", "commit", "SKILL.md"),
};

const prefixes = (doc) =>
  (doc.match(/^\| ([a-z]+)\/ +\|/gm) || []).map((r) => r.match(/[a-z]+/)[0]);

// A branch prefix and a commit type both come from Conventional Commits. Renaming one alone stops
// the same change from becoming a feat commit on a feat/ branch and splits the history's types.
test("every branch prefix exists in the commit type table", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} exists`);
    const found = prefixes(readFileSync(path, "utf8"));
    assert.ok(
      found.length >= 7,
      `${lang}: seven or more prefixes are readable (${found.join(", ")})`,
    );
    assert.ok(found.includes("feat"), `${lang}: it uses feat/ rather than feature/`);
    const commitDoc = readFileSync(commits[lang], "utf8");
    for (const prefix of found) {
      assert.match(
        commitDoc,
        new RegExp(`^\\| ${prefix} `, "m"),
        `${lang}: commit carries ${prefix}`,
      );
    }
  }
});

// Whether anything is staged before a branch is cut is undecided. A bare git diff shows the staged
// side as empty and leaves the type decision resting on git status --porcelain alone.
test("reading the changes looks at both the staged and the unstaged side", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /`git diff HEAD`/, `${lang}: git diff HEAD reads both sides`);
    assert.doesNotMatch(
      doc,
      /`git diff` を並列|`git diff` in parallel/,
      `${lang}: it is not the bare diff`,
    );
  }
});

// scribe creates scribe/<yyyymmdd-HHMMSS>. The date prohibition must not read as a
// repository-wide rule.
test("the date prohibition is scoped to the names this skill creates", () => {
  const scoped = {
    ja: /このスキルが作る名前に日付は入れない/,
    en: /Names this skill creates carry no date/,
  };
  for (const [lang, path] of Object.entries(skills)) {
    assert.match(readFileSync(path, "utf8"), scoped[lang], `${lang}: the subject is scoped`);
  }
  const scribe = readFileSync(join(root, "skills", "scribe", "SKILL.md"), "utf8");
  assert.match(scribe, /scribe\/<yyyymmdd-HHMMSS>/, "scribe creates names carrying a date");
});
