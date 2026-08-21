// /checkout, /commit, and /pr are named by no other skill and name none, so a sweep for dead
// skills reads them as unreachable. They are the manual counterpart of build's stages, and each
// says which stage, so the pairing survives a reader who only opens one of the two.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = ["ja", "en"];
const at = (lang, ...parts) => join(root, ...(lang === "ja" ? [".ja"] : []), ...parts);

// The stage each skill stands in for, and the phase() call proving build still runs it.
const PAIRS = { checkout: "Branch", commit: "Code", pr: "Ship" };

test("each manual-lane skill names the build stage it stands in for", async () => {
  const wording = { ja: /手で行う版|手で 1 回行う版/, en: /manual counterpart/i };
  for (const lang of LANGS) {
    for (const [skill, stage] of Object.entries(PAIRS)) {
      const doc = await readFile(at(lang, "skills", skill, "SKILL.md"), "utf8");
      const opening = doc.split("\n## ")[0];
      assert.match(opening, wording[lang], `${lang}:${skill}: the opening names the lane`);
      assert.ok(opening.includes(stage), `${lang}:${skill}: it names build's ${stage} stage`);
    }
  }
});

test("build still runs every stage the manual lane stands in for", async () => {
  const buildJs = await readFile(join(root, "workflows", "build.js"), "utf8");
  for (const stage of Object.values(PAIRS)) {
    assert.ok(buildJs.includes(`phase("${stage}")`), `build runs a ${stage} phase`);
  }
});

// The rules are shared through a file each side reads, so a reference that names only one of them
// leaves the other looking like it invented its own.
test("each shared rule file names both readers", async () => {
  const shared = {
    "skills/checkout/references/branch-naming.md": { ja: /build/, en: /build/ },
    "skills/pr/references/pr-writing.md": { ja: /build/, en: /build/ },
  };
  for (const lang of LANGS) {
    for (const [rel, expected] of Object.entries(shared)) {
      const doc = await readFile(at(lang, rel), "utf8");
      assert.match(doc, expected[lang], `${lang}:${rel}: it names build as a reader`);
      assert.match(doc, /\/(checkout|pr)\b/, `${lang}:${rel}: it names the skill as a reader`);
    }
  }
});
