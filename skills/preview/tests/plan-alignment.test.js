// Three places read the plan's id format (U-NNN / T-NNN): think's template produces it, build.js
// cross-checks it deterministically, and preview's Plan alignment check matches it against the
// diff. Changing the numbering format on think's side drops nothing at run time in preview; the
// match just quietly finds nothing.
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

// This watches the lines the skeleton actually numbers. The strings `U-NNN` and `T-NNN` also
// appear in guidelines and tables, so their mere presence would not reveal a change to the
// skeleton's numbering format.
test("think's skeleton numbers in the U-NNN and T-NNN formats", () => {
  for (const lang of LANGS) {
    const tpl = read(at(lang, "skills", "think", "templates", "plan.md"));
    assert.match(tpl, /^### U-\d{3}/m, `${lang}: the unit heading takes the U-NNN format`);
    assert.match(tpl, /^- T-\d{3}/m, `${lang}: the acceptance test row takes the T-NNN format`);
  }
});

test("preview and build.js name the plan's id format with the same words", () => {
  for (const lang of LANGS) {
    const sites = [
      ["preview SKILL.md", at(lang, "skills", "preview", "SKILL.md")],
      ["build.js", at(lang, "workflows", "build.js")],
    ];
    for (const [name, path] of sites) {
      const doc = read(path);
      for (const id of ["U-NNN", "T-NNN"]) {
        assert.ok(doc.includes(id), `${lang}: ${name} writes ${id}`);
      }
    }
  }
});

// preview takes the plan from the issue's `## Plan` section. That section name is the contract
// issue transfers into and build demands.
test("preview names the plan's location as the ## Plan section", () => {
  for (const lang of LANGS) {
    const doc = read(at(lang, "skills", "preview", "SKILL.md"));
    assert.ok(doc.includes("## Plan"), `${lang}: it names the ## Plan section`);
  }
});

// Code quality belongs to /code-review and a deep pass to the audit workflow. With those checks
// back in, preview overlaps both and the plan match stops being what it is for.
test("preview screens the plan alignment alone", () => {
  for (const lang of LANGS) {
    const doc = read(at(lang, "skills", "preview", "SKILL.md"));
    for (const gone of ["[must]", "[nits]", "Code smells", "Security", "Performance"]) {
      assert.ok(!doc.includes(gone), `${lang}: ${gone} stays out of preview`);
    }
  }
});
