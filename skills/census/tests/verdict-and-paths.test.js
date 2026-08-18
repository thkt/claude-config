import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const at = (lang, ...parts) => join(root, ...(lang === "ja" ? [".ja"] : []), "skills", ...parts);
const pair = (...parts) => ({ ja: at("ja", ...parts), en: at("en", ...parts) });

const skills = pair("census", "SKILL.md");
const criteria = pair("census", "references", "decision-criteria.md");
const targets = pair("census", "references", "detection-targets.md");
const templates = pair("census", "templates", "report-template.md");
const agent = join(root, "agents", "critics", "critic-design.md");

const eachLanguage = async (paths, check) => {
  for (const [lang, path] of Object.entries(paths)) {
    check(await readFile(path, "utf8"), lang);
  }
};

// A short parse would leave the next test matching nothing.
const agentVerdicts = async () => {
  const doc = await readFile(agent, "utf8");
  const found = [...doc.matchAll(/^\| (confirmed|weakened|needs_revision) +\|/gm)].map((m) => m[1]);
  assert.equal(found.length, 3, `three agent verdicts are readable (${found.join(", ")})`);
  return found;
};

// A phase inserted or dropped on one language side alone would leave the two skills running
// different flows under one name.
test("both languages run the same five phases in the same order", () =>
  eachLanguage(skills, (doc, lang) => {
    const numbers = [...doc.matchAll(/^## Phase (\d+):/gm)].map((m) => Number(m[1]));
    assert.deepEqual(numbers, [1, 2, 3, 4, 5], `${lang}: phases run 1 through 5 in order`);
  }));

// Two homes for the cross-reference rule would let one drift from the other.
test("the DR cross-reference has a single home", () =>
  eachLanguage(skills, (doc, lang) => {
    const mentions = [...doc.matchAll(/DR-covered \(excluded\)/g)];
    assert.equal(mentions.length, 1, `${lang}: the exclusion is recorded in one place`);
    assert.match(doc, /^## Phase 3: /m, `${lang}: it is its own phase`);
  }));

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

test("the criteria define census's own accept-or-reject words", () =>
  eachLanguage(criteria, (doc, lang) => {
    for (const word of ["keep", "downgrade", "drop"]) {
      assert.match(doc, new RegExp(`\`${word}\``), `${lang}: the criteria define ${word}`);
    }
  }));

test("the skill takes the verdicts critic-design's own definition returns", async () => {
  const verdicts = await agentVerdicts();
  await eachLanguage(skills, (doc, lang) => {
    for (const verdict of verdicts) {
      assert.match(doc, new RegExp(verdict), `${lang}: it takes the agent's ${verdict}`);
    }
  });
});

test("the skill does not make critic-design return census's words", () =>
  eachLanguage(skills, (doc, lang) => {
    assert.doesNotMatch(
      doc,
      /(returns one of `keep`|`keep`\/`downgrade`\/`drop` のいずれかの)/,
      `${lang}: it does not make the agent return census's own words`,
    );
  }));

// A hardcoded ~/.claude path names the dev tree, the wrong copy when census runs from a plugin.
test("the criteria path handed to a subagent names this skill's own copy", () =>
  eachLanguage(skills, (doc, lang) => {
    const spawn = doc.split(/### Step 2: Devil's Advocate/)[1] || "";
    assert.ok(spawn.length > 0, `${lang}: the challenge step is readable`);
    assert.match(
      spawn,
      /\$\{CLAUDE_SKILL_DIR\}\/references\/decision-criteria\.md/,
      `${lang}: the criteria path is skill-relative`,
    );
    assert.doesNotMatch(spawn, /~\/\.claude\/skills\//, `${lang}: no hardcoded dev-tree path`);
  }));

// A column dropped from the template would leave the mining step with no shape to fill.
test("the template carries the columns the mining step records", () =>
  eachLanguage(templates, (doc, lang) => {
    const header = doc.split("\n").find((line) => line.includes("Incomplete-contract?")) || "";
    for (const col of ["Line", "Decision", "Evidence", "Documented?"]) {
      assert.ok(header.includes(col), `${lang}: Source File Decisions carries ${col}`);
    }
  }));

// MARKDOWN.md § Do not forbids a paragraph immediately after a table.
test("the tally row sits before the DR Promotion Candidates table", () =>
  eachLanguage(templates, (doc, lang) => {
    const tally = doc.indexOf("keep {N} / downgrade {N} / drop {N}");
    const table = doc.search(/^\| #\s+\| Candidate/m);
    assert.ok(tally >= 0 && table >= 0, `${lang}: both the tally row and the table are present`);
    assert.ok(tally < table, `${lang}: the tally sits before the table`);
  }));

// One pattern accepting either wording would pass when .ja carries the English phrase.
test("each language states the ordering in its own prose", () => {
  const phrase = { ja: /直前に/, en: /right before/ };
  return eachLanguage(skills, (doc, lang) => {
    assert.match(doc, phrase[lang], `${lang}: the instruction also says to put it before`);
  });
});
