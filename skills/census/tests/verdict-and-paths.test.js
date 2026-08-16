import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const templates = {
  ja: join(root, ".ja", "skills", "census", "templates", "report-template.md"),
  en: join(root, "skills", "census", "templates", "report-template.md"),
};
const agent = join(root, "agents", "critics", "critic-design.md");

// Two vocabularies of verdict exist. keep / downgrade / drop is census's own accept-or-reject
// decision, defined in decision-criteria.md, while confirmed / weakened / needs_revision is what
// critic-design returns. Making the agent return census's words would put the agent definition
// and the Task prompt in conflict.
test("census's accept-or-reject words stay unmixed with critic-design's verdicts", () => {
  const CENSUS = ["keep", "downgrade", "drop"];
  for (const [lang, path] of Object.entries(criteria)) {
    const doc = readFileSync(path, "utf8");
    for (const word of CENSUS) {
      assert.match(doc, new RegExp(`\`${word}\``), `${lang}: the criteria define ${word}`);
    }
  }
  const verdicts = [
    ...readFileSync(agent, "utf8").matchAll(/^\| (confirmed|weakened|needs_revision) +\|/gm),
  ].map((m) => m[1]);
  assert.equal(verdicts.length, 3, `three agent verdicts are readable (${verdicts.join(", ")})`);

  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} exists`);
    const doc = readFileSync(path, "utf8");
    for (const verdict of verdicts) {
      assert.match(doc, new RegExp(verdict), `${lang}: it takes the agent's ${verdict}`);
    }
    assert.doesNotMatch(
      doc,
      /(returns one of `keep`|`keep`\/`downgrade`\/`drop` のいずれかの)/,
      `${lang}: it does not make the agent return census's own words`,
    );
  }
});

// ${CLAUDE_SKILL_DIR} expands in the skill body alone. Passed to a subagent it arrives literal,
// the Read fails, and challenge runs with no decision criteria.
test("the path handed to a subagent is absolute", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const spawn = doc.split(/### 5b/)[1] || "";
    assert.ok(spawn.length > 0, `${lang}: Phase 5b is readable`);
    assert.match(
      spawn,
      /~\/\.claude\/skills\/census\/references\/decision-criteria\.md/,
      `${lang}: an absolute path`,
    );
    assert.doesNotMatch(
      spawn,
      /\$\{CLAUDE_SKILL_DIR\}\/references/,
      `${lang}: no skill variable is handed to the subagent`,
    );
  }
});

// MARKDOWN.md § Do not forbids a paragraph immediately after a table. The tally goes before it.
test("the tally row sits before the DR Promotion Candidates table", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = readFileSync(path, "utf8");
    const tally = doc.indexOf("keep {N} / downgrade {N} / drop {N}");
    const table = doc.indexOf("| #   | Candidate");
    assert.ok(tally >= 0 && table >= 0, `${lang}: both the tally row and the table are present`);
    assert.ok(tally < table, `${lang}: the tally sits before the table`);
  }
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(
      doc,
      /(直前に|right before)/,
      `${lang}: the instruction also says to put it before`,
    );
  }
});
