// The PR template priority lives in two places: /pr's SKILL.md and build.js's ship prompt. The
// ship agent is a subagent and cannot read SKILL.md, so the duplication cannot be removed
// structurally. Changing one side alone drops nothing at run time, so this static match forces
// both to follow in the same commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LANGS = ["ja", "en"];
const at = (lang, ...parts) => join(root, ...(lang === "ja" ? [".ja"] : []), ...parts);

function read(path) {
  assert.ok(existsSync(path), `${path} exists`);
  return readFileSync(path, "utf8");
}

// The order itself is checked. Matching sets in a swapped order change which template gets used.
const PRIORITY = [
  ".github/pull_request_template.md",
  "pull_request_template.md",
  "docs/pull_request_template.md",
  "PULL_REQUEST_TEMPLATE/",
];

const positions = (text) => PRIORITY.map((p) => text.indexOf(p));

test("the PR template priority appears in the same order in pr SKILL.md and build.js's ship prompt", () => {
  for (const lang of LANGS) {
    for (const [name, path] of [
      ["pr SKILL.md", at(lang, "skills", "pr", "SKILL.md")],
      ["build.js", at(lang, "workflows", "build.js")],
    ]) {
      const found = positions(read(path));
      found.forEach((idx, i) => {
        assert.ok(idx >= 0, `${lang}: ${name} writes ${PRIORITY[i]}`);
      });
      const sorted = [...found].sort((a, b) => a - b);
      assert.deepEqual(found, sorted, `${lang}: ${name} keeps the defined priority order`);
    }
  }
});

// Downstream reads the bundled template's required sections by heading name: use-workflow-pageshot
// reads How to Test, and Related carries the issue link through Closes #. A rename severs those
// links silently.
test("the bundled template carries the required sections downstream depends on", () => {
  for (const lang of LANGS) {
    const tpl = read(at(lang, "skills", "pr", "templates", "pr.md"));
    for (const heading of ["## How to Test", "## Related", "## Review focus"]) {
      assert.ok(tpl.includes(heading), `${lang}: the skeleton carries ${heading}`);
    }
    assert.ok(tpl.includes("Closes #"), `${lang}: Related carries Closes #`);
  }
});

// build.js's ship prompt names the bundled template by a literal path. Moving the path leaves the
// reference pointing at nothing.
test("the bundled PR template build.js names exists", () => {
  const bundled = "skills/pr/templates/pr.md";
  for (const lang of LANGS) {
    assert.ok(
      read(at(lang, "workflows", "build.js")).includes(bundled),
      `${lang}: build.js names ${bundled}`,
    );
    assert.ok(
      existsSync(at(lang, "skills", "pr", "templates", "pr.md")),
      `${lang}: the bundled target exists`,
    );
  }
});
