import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "census", "SKILL.md"),
  en: join(root, "skills", "census", "SKILL.md"),
};
const criteria = {
  ja: join(root, ".ja", "skills", "census", "references", "decision-criteria.md"),
  en: join(root, "skills", "census", "references", "decision-criteria.md"),
};
const targets = {
  ja: join(root, ".ja", "skills", "census", "references", "detection-targets.md"),
  en: join(root, "skills", "census", "references", "detection-targets.md"),
};
const templates = {
  ja: join(root, ".ja", "skills", "census", "templates", "report-template.md"),
  en: join(root, "skills", "census", "templates", "report-template.md"),
};
const agent = join(root, "agents", "critics", "critic-design.md");

// A short parse would leave the next test matching nothing.
const agentVerdicts = async () => {
  const doc = await readFile(agent, "utf8");
  const found = [...doc.matchAll(/^\| (confirmed|weakened|needs_revision) +\|/gm)].map((m) => m[1]);
  assert.equal(found.length, 3, `three agent verdicts are readable (${found.join(", ")})`);
  return found;
};

// Collect -> mine -> cross-reference -> judge -> emit. A phase inserted or dropped on one language
// side alone would leave the two skills running different flows under one name.
test("both languages run the same five phases in the same order", async () => {
  const expected = [1, 2, 3, 4, 5];
  for (const [lang, path] of Object.entries(skills)) {
    const doc = await readFile(path, "utf8");
    const numbers = [...doc.matchAll(/^## Phase (\d+):/gm)].map((m) => Number(m[1]));
    assert.deepEqual(numbers, expected, `${lang}: phases run 1 through 5 in order`);
  }
});

// The DR cross-reference used to run once per stream, so a change to the rule had two homes.
test("the DR cross-reference has a single home", async () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = await readFile(path, "utf8");
    const mentions = [...doc.matchAll(/DR-covered \(excluded\)/g)];
    assert.equal(mentions.length, 1, `${lang}: the exclusion is recorded in one place`);
    assert.match(doc, /^## Phase 3: /m, `${lang}: it is its own phase`);
  }
});

// A reference naming a phase that no longer exists sends the reader to the wrong step.
test("the phase numbers the references cite exist in SKILL.md", async () => {
  for (const lang of ["ja", "en"]) {
    const skill = await readFile(skills[lang], "utf8");
    const present = new Set([...skill.matchAll(/^## Phase (\d+):/gm)].map((m) => m[1]));
    for (const [name, paths] of Object.entries({ criteria, targets, templates })) {
      const doc = await readFile(paths[lang], "utf8");
      for (const [, cited] of doc.matchAll(/Phase (\d+)/g)) {
        assert.ok(present.has(cited), `${lang}: ${name} cites Phase ${cited}, which SKILL.md has`);
      }
    }
  }
});

test("the criteria define census's own accept-or-reject words", async () => {
  for (const [lang, path] of Object.entries(criteria)) {
    const doc = await readFile(path, "utf8");
    for (const word of ["keep", "downgrade", "drop"]) {
      assert.match(doc, new RegExp(`\`${word}\``), `${lang}: the criteria define ${word}`);
    }
  }
});

test("the skill takes the verdicts critic-design's own definition returns", async () => {
  const verdicts = await agentVerdicts();
  for (const [lang, path] of Object.entries(skills)) {
    const doc = await readFile(path, "utf8");
    for (const verdict of verdicts) {
      assert.match(doc, new RegExp(verdict), `${lang}: it takes the agent's ${verdict}`);
    }
  }
});

test("the skill does not make critic-design return census's words", async () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = await readFile(path, "utf8");
    assert.doesNotMatch(
      doc,
      /(returns one of `keep`|`keep`\/`downgrade`\/`drop` のいずれかの)/,
      `${lang}: it does not make the agent return census's own words`,
    );
  }
});

// A hardcoded ~/.claude path names the dev tree, the wrong copy when census runs from a plugin.
test("the criteria path handed to a subagent names this skill's own copy", async () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = await readFile(path, "utf8");
    const spawn = doc.split(/### Step 2: Devil's Advocate/)[1] || "";
    assert.ok(spawn.length > 0, `${lang}: the challenge step is readable`);
    assert.match(
      spawn,
      /\$\{CLAUDE_SKILL_DIR\}\/references\/decision-criteria\.md/,
      `${lang}: the criteria path is skill-relative`,
    );
    assert.doesNotMatch(spawn, /~\/\.claude\/skills\//, `${lang}: no hardcoded dev-tree path`);
  }
});

// MARKDOWN.md § Do not forbids a paragraph immediately after a table.
test("the tally row sits before the DR Promotion Candidates table", async () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = await readFile(path, "utf8");
    const tally = doc.indexOf("keep {N} / downgrade {N} / drop {N}");
    const table = doc.indexOf("| #   | Candidate");
    assert.ok(tally >= 0 && table >= 0, `${lang}: both the tally row and the table are present`);
    assert.ok(tally < table, `${lang}: the tally sits before the table`);
  }
});

// One pattern accepting either wording would pass when .ja carries the English phrase.
test("each language states the ordering in its own prose", async () => {
  const phrase = { ja: /直前に/, en: /right before/ };
  for (const [lang, path] of Object.entries(skills)) {
    const doc = await readFile(path, "utf8");
    assert.match(doc, phrase[lang], `${lang}: the instruction also says to put it before`);
  }
});
