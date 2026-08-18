import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// These sweep every instruction directory, so they belong to no single skill. Living here also
// keeps them outside their own scan, which is why no self-exemption is needed below.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Letting readdir throw on a missing directory keeps a deleted instruction tree from quietly
// shrinking the sweep to the directories that remain.
const instructionFiles = async () => {
  const found = [];
  for (const prefix of ["", ".ja"]) {
    for (const dir of ["skills", "agents", "rules", "workflows"]) {
      const base = join(root, prefix, dir);
      for (const entry of await readdir(base, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.(md|js|py)$/.test(entry.name)) continue;
        const full = join(entry.parentPath ?? entry.path, entry.name);
        const rel = full.slice(join(root, prefix).length + 1);
        if (rel.includes("__pycache__")) continue;
        found.push({ lang: prefix || "en", rel, full });
      }
    }
  }
  return found;
};

// DR names a decision beyond architecture. An old ADR left in a live instruction makes the writer
// read only architectural decisions as recordable.
test("no live instruction or convention still carries the old name ADR", async () => {
  // A summary of Fowler's article, quoting ADR as the source's own term.
  const EXEMPT = "skills/dr/references/fowler-adr.md";
  const declares = { ja: /このファイルでは ADR と呼ぶ/, en: /it says ADR throughout/ };
  for (const [lang, rel] of [
    ["ja", join(".ja", EXEMPT)],
    ["en", EXEMPT],
  ]) {
    const doc = await readFile(join(root, rel), "utf8");
    assert.match(doc, declares[lang], `${lang}: the exempt file declares its grounds`);
  }

  // when_to_use lists the words a user types, so ADR stays there to reach whoever types it.
  const files = (await instructionFiles()).filter((f) => f.rel !== EXEMPT);
  assert.ok(files.length > 100, `the number scanned (${files.length})`);
  for (const { lang, rel, full } of files) {
    const text = (await readFile(full, "utf8")).replace(/^when_to_use:.*$/gm, "");
    assert.doesNotMatch(text, /\bADRs?\b/, `${lang}: ${rel} still carries the old name ADR`);
  }
  assert.doesNotMatch(await readFile(join(root, "README.md"), "utf8"), /\bADRs?\b/, "README.md");
});

// DR-0090 unified work products under .claude/workspace/, so a bare workspace/ in a live
// instruction points at a directory that sits under no project root.
test("no live instruction or convention names a workspace/ without .claude/", async () => {
  const BARE_WORKSPACE = /(?<!\.claude\/)(?<![\w/.])workspace\//;
  const files = await instructionFiles();
  assert.ok(files.length > 100, `the number scanned (${files.length})`);
  for (const { lang, rel, full } of files) {
    const text = await readFile(full, "utf8");
    assert.doesNotMatch(text, BARE_WORKSPACE, `${lang}: ${rel} names a bare workspace/`);
  }
});
