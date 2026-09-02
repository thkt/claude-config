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

// A skill body expands ${CLAUDE_SKILL_DIR}, so a home-anchored path there names the dev tree and a
// plugin install reads another copy of the file, or none at all.
test("no skill names a bundled asset by a home-anchored path", async () => {
  // settings.json belongs to the running side, so the same path holds under a plugin install.
  const RUNNING_SIDE = /\.claude\/settings\.json/;
  const HOME_ANCHORED = /~\/\.claude\/|\$HOME\/\.claude\//;
  // A test under skills/ is not an instruction the harness reads, so a path it names is a fixture.
  const files = (await instructionFiles()).filter(
    (f) => f.rel.startsWith("skills/") && !f.rel.includes("/tests/"),
  );
  assert.ok(files.length > 40, `the number scanned (${files.length})`);
  for (const { lang, rel, full } of files) {
    const named = (await readFile(full, "utf8"))
      .split("\n")
      .filter((line) => HOME_ANCHORED.test(line) && !RUNNING_SIDE.test(line))
      .map((line) => line.trim());
    assert.deepEqual(named, [], `${lang}: ${rel} names a bundled asset by a home-anchored path`);
  }
});

// An agent body expands ${CLAUDE_PLUGIN_ROOT} under a plugin install alone, so SUBAGENT.md
// § Reference notation pairs the plugin form with one fallback sentence that sends the dev tree to
// ~/.claude/. A home-anchored path outside that sentence reads the dev tree from a plugin install,
// and a plugin form without the sentence reads nothing from the dev tree. Neither failure reports
// itself at run time.
test("every agent naming a bundled asset pairs the plugin form with the fallback sentence", async () => {
  const FALLBACK = {
    en: "When a path below still begins with `${`, the harness left the variable unexpanded; read the same path under `~/.claude/` instead.",
    ".ja":
      "下のパスが `${` のまま始まっているときは harness が変数を展開していないので、代わりに `~/.claude/` 配下の同じパスを読む。",
  };
  // settings.json, cache/, and the history/ output belong to the running side, so the same path
  // holds under a plugin.
  const RUNNING_SIDE = /(~|\$HOME)\/\.claude\/(settings\.json|cache\/|history\/)/;
  const HOME_ANCHORED = /~\/\.claude\/|\$HOME\/\.claude\//;
  const files = (await instructionFiles()).filter(
    (f) => f.rel.startsWith("agents/") && !f.rel.includes("/tests/"),
  );
  assert.ok(files.length > 20, `the number scanned (${files.length})`);
  for (const { lang, rel, full } of files) {
    const text = await readFile(full, "utf8");
    const named = text
      .split("\n")
      .filter((line) => HOME_ANCHORED.test(line) && !RUNNING_SIDE.test(line))
      .map((line) => line.trim())
      .filter((line) => line !== FALLBACK[lang]);
    assert.deepEqual(named, [], `${lang}: ${rel} names a bundled asset by a home-anchored path`);
    if (text.includes("${CLAUDE_PLUGIN_ROOT}")) {
      assert.ok(
        text.includes(FALLBACK[lang]),
        `${lang}: ${rel} names the plugin form without the fallback sentence`,
      );
    }
  }
});

// A bare Bash grant hands a skill every shell command, and the commands it actually names are a
// short list in its own body. Nothing at run time reports the gap: the wider grant only ever shows
// up as a prompt that did not appear.
test("no skill grants Bash without narrowing it to the commands it names", async () => {
  const files = (await instructionFiles()).filter((f) => f.rel.endsWith("/SKILL.md"));
  assert.ok(files.length > 40, `the number scanned (${files.length})`);
  for (const { lang, rel, full } of files) {
    const grant = (await readFile(full, "utf8")).match(/^allowed-tools:.*$/m)?.[0] ?? "";
    assert.doesNotMatch(grant, /(^|\s)Bash(\s|$)/, `${lang}: ${rel} grants Bash unnarrowed`);
  }
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
