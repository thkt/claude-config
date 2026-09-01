import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "commit", "SKILL.md"),
  en: join(root, "skills", "commit", "SKILL.md"),
};
const TYPES = ["feat", "fix", "refactor", "docs", "test", "chore", "perf", "style", "ci"];

const eachLanguage = async (check) => {
  for (const [lang, path] of Object.entries(skills)) {
    await check(await readFile(path, "utf8"), lang);
  }
};

const commitBlock = (doc) => doc.split("```bash\n")[1]?.split("```")[0] ?? "";

// code.js writes the subject of every unit commit build makes, so the two write one history.
// The rules are one row, too small to earn a file read per unit, so the copy in the prompt stands
// and this holds it to the row it copied.
test("the subject rules code.js hands its commit agent match this skill's Subject row", async () => {
  for (const [lang, prefix] of [
    ["en", ""],
    ["ja", ".ja"],
  ]) {
    const row = (await readFile(skills[lang], "utf8"))
      .split("\n")
      .find((line) => line.startsWith("| Subject"));
    assert.ok(row, `${lang}: the skill carries a Subject row`);
    const constraints = row.split("|")[2].trim();
    // A substring check alone is one-directional: the row could lose a constraint and code.js
    // would still contain what is left, so the count is asserted too.
    const items = constraints.split(lang === "ja" ? "、" : ", ");
    assert.equal(items.length, 4, `${lang}: the row states four constraints (${constraints})`);
    // Substring, not a keyword sweep: "小文字" and "小文字始まり" both answer a keyword and say
    // different things, which is how the two sides drifted while the check stayed green.
    const codeJs = await readFile(join(root, prefix, "workflows", "code.js"), "utf8");
    assert.ok(
      codeJs.includes(constraints),
      `${lang}: code.js hands the agent the row verbatim (${constraints})`,
    );
  }
});

// Dropping a type leaves the nearest row getting picked, and when that sweeps up feat or fix the
// release decision goes wrong.
test("the type list matches across both languages", () =>
  eachLanguage((doc, lang) => {
    const rows = [...doc.matchAll(new RegExp(`^\\| (${TYPES.join("|")}) `, "gm"))];
    assert.deepEqual(
      rows.map((m) => m[1]),
      TYPES,
      `${lang}: the type rows match the list in order`,
    );
  }));

// feat declares a semver minor bump, so defaulting to it would push a release on every change
// whose type could not be told.
test("the default type when it cannot be told is not feat", () =>
  eachLanguage((doc, lang) => {
    const fallback = {
      ja: /判別できないときは (\w+) とする/,
      en: /When it cannot be told, use (\w+)\./,
    };
    const found = doc.match(fallback[lang]);
    assert.ok(found, `${lang}: the default type is readable`);
    assert.notEqual(found[1], "feat", `${lang}: the default is not feat`);
    assert.ok(TYPES.includes(found[1]), `${lang}: the default ${found[1]} is in the type list`);
  }));

// Writing /tmp literally rests on the sandbox allowlist, which the commit cannot count on.
test("the sandbox-compatible commit uses $TMPDIR", () =>
  eachLanguage((doc, lang) => {
    const block = commitBlock(doc);
    assert.match(block, /\$TMPDIR/, `${lang}: the temporary file sits under $TMPDIR`);
    assert.doesNotMatch(block, /\/tmp\//, `${lang}: no literal /tmp remains`);
    // A hook rejects rm, so reaching for it to clear the file stops the commit.
    assert.doesNotMatch(block, /\brm\b/, `${lang}: rm is not used`);
  }));

// A commit to the wrong repository cannot be taken back, so the manual route carries the same
// guard the code workflow uses for its per-unit commits.
test("the repository is confirmed before the commit", async () => {
  await eachLanguage((doc, lang) => {
    const block = commitBlock(doc);
    const guard = block.indexOf("git rev-parse --show-toplevel");
    const commit = block.indexOf("git commit -F");
    assert.ok(guard >= 0, `${lang}: the repo guard is present`);
    assert.ok(guard < commit, `${lang}: the guard sits before the commit`);
  });
  assert.match(
    await readFile(join(root, "workflows", "code.js"), "utf8"),
    /git rev-parse --show-toplevel/,
    "the code workflow confirms with the same command",
  );
});

// A step citing a section the file no longer carries sends the reader nowhere.
test("every section a step cites exists", () =>
  eachLanguage((doc, lang) => {
    const cited = [...doc.matchAll(/§ ([^,)]+)/g)].map((m) => m[1].trim());
    assert.equal(cited.length, 3, `${lang}: the execution steps cite three sections`);
    for (const name of cited) {
      assert.match(doc, new RegExp(`^## ${name}$`, "m"), `${lang}: ## ${name} exists`);
    }
  }));

// A command the block runs but the list omits brings a confirmation prompt at run time, and a
// grant nothing runs overstates what the skill can reach.
test("allowed-tools matches the commands the block runs", () =>
  eachLanguage((doc, lang) => {
    const run = [...new Set([...commitBlock(doc).matchAll(/^(\w+) /gm)].map((m) => m[1]))];
    const granted = [...doc.split("---")[1].matchAll(/Bash\((\w+):\*\)/g)].map((m) => m[1]);
    assert.deepEqual(granted.sort(), run.sort(), `${lang}: the grants match the commands`);
  }));
