import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "commit", "SKILL.md"),
  en: join(root, "skills", "commit", "SKILL.md"),
};

// The Conventional Commits types. Dropping one from the table leaves a change with no type that
// fits and haiku settles on the nearest one. When feat or fix is swept up, the semver-bearing
// types, the release decision goes wrong.
const TYPES = ["feat", "fix", "refactor", "docs", "test", "chore", "perf", "style", "ci"];

test("the type list matches across both languages", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} exists`);
    const doc = readFileSync(path, "utf8");
    for (const type of TYPES) {
      assert.match(doc, new RegExp(`^\\| ${type} `, "m"), `${lang}: the ${type} row`);
    }
    const rows = doc.match(/^\| (feat|fix|refactor|docs|test|chore|perf|style|ci) /gm) || [];
    assert.equal(rows.length, TYPES.length, `${lang}: the type row count is ${TYPES.length}`);
  }
});

// The default when the type cannot be told. feat declares a semver minor bump, so choosing it
// without grounds misleads the release decision. What is checked is the default value itself
// rather than the wording.
test("the default type when it cannot be told is not feat", () => {
  const fallback = {
    ja: /判別できないときは (\w+) とする/,
    en: /When it cannot be told, use (\w+)\./,
  };
  for (const [lang, path] of Object.entries(skills)) {
    const found = readFileSync(path, "utf8").match(fallback[lang]);
    assert.ok(found, `${lang}: the default type is readable`);
    assert.notEqual(found[1], "feat", `${lang}: the default is not feat`);
    assert.ok(TYPES.includes(found[1]), `${lang}: the default ${found[1]} is in the type list`);
  }
});

// Where the temporary file goes. Writing /tmp literally rests on the sandbox's allowlist, so it is
// taken through $TMPDIR.
test("the sandbox-compatible commit uses $TMPDIR", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const block = doc.slice(doc.indexOf("```bash"), doc.indexOf("```", doc.indexOf("```bash") + 3));
    assert.match(block, /\$TMPDIR/, `${lang}: the temporary file sits under $TMPDIR`);
    assert.doesNotMatch(block, /\/tmp\/claude/, `${lang}: no literal /tmp remains`);
    // A hook rejects rm. Cleanup goes through mv to ~/.Trash.
    assert.match(block, /mv .* ~\/\.Trash\//, `${lang}: cleanup goes through mv`);
    assert.doesNotMatch(block, /\brm\b/, `${lang}: rm is not used`);
  }
});

// A commit to the wrong repository cannot be taken back. The manual commit route carries the same
// confirmation as the guard the code workflow uses for its per-unit commits.
test("the repository is confirmed before the commit", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const block = doc.slice(doc.indexOf("```bash"), doc.indexOf("```", doc.indexOf("```bash") + 3));
    const guard = block.indexOf("git rev-parse --show-toplevel");
    const commit = block.indexOf("git commit -F");
    assert.ok(guard >= 0, `${lang}: the repo guard is present`);
    assert.ok(guard < commit, `${lang}: the guard sits before the commit`);
  }
  assert.match(
    readFileSync(join(root, "workflows", "code.js"), "utf8"),
    /git rev-parse --show-toplevel/,
    "the code workflow confirms with the same command",
  );
});

// allowed-tools enumerates what is pre-approved. A command the steps use but the list omits brings
// a confirmation prompt at run time.
test("allowed-tools covers every command the steps use", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const frontmatter = readFileSync(path, "utf8").split("---")[1];
    for (const grant of ["Bash(git:*)", "Bash(cat:*)", "Bash(mv:*)"]) {
      assert.ok(frontmatter.includes(grant), `${lang}: it grants ${grant}`);
    }
  }
});
