import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "challenge", "SKILL.md"),
  en: join(root, "skills", "challenge", "SKILL.md"),
};
const agentDoc = await readFile(join(root, "agents", "critics", "critic-design.md"), "utf8");

const eachLanguage = async (check) => {
  for (const [lang, path] of Object.entries(skills)) {
    check(await readFile(path, "utf8"), lang);
  }
};

const phases = (doc) => ({
  "Phase 1": doc.slice(doc.indexOf("## Phase 1"), doc.indexOf("## Phase 2")),
  "Phase 2": doc.slice(doc.indexOf("## Phase 2")),
});

// Handing GO / NO-GO to the spawn step would conflict with the agent definition, and the receiving
// side would hold a value it cannot interpret.
test("challenge takes critic-design's verdict as it stands", () => {
  const verdicts = [...agentDoc.matchAll(/^\| (confirmed|weakened|needs_revision) +\|/gm)].map(
    (m) => m[1],
  );
  assert.equal(verdicts.length, 3, `three agent verdicts are readable (${verdicts.join(", ")})`);

  return eachLanguage((doc, lang) => {
    for (const verdict of verdicts) {
      assert.match(doc, new RegExp(verdict), `${lang}: it names ${verdict}`);
    }
    const [spawn, verdictStep] = phases(doc)["Phase 2"].split("### Step 2");
    assert.ok(verdictStep, `${lang}: Phase 2 has a Step 2 bounding the spawn step`);
    assert.doesNotMatch(spawn, /\bGO\b/, `${lang}: the spawn step hands over no GO / NO-GO`);
  });
});

// Writing weaknesses as string[] drops severity during the match and misjudges the duplicates.
test("the shape of weaknesses matches the agent's Output", () => {
  assert.match(
    agentDoc,
    /Each item includes viewpoint, severity, finding, evidence/,
    "the agent enumerates what a weakness holds",
  );
  return eachLanguage((doc, lang) => {
    assert.doesNotMatch(doc, /weaknesses: string\[\]/, `${lang}: it is not written as string[]`);
    assert.match(doc, /severity/, `${lang}: it names what an item holds`);
  });
});

// A Pass listed but never spawned leaves the reader counting on an attack that never lands.
test("every Pass the table lists is a critic-design", () =>
  eachLanguage((doc, lang) => {
    const table = phases(doc)
      ["Phase 2"].split("\n\n")
      .find((block) => block.startsWith("| Pass"));
    assert.ok(table, `${lang}: the Pass table is readable`);
    const rows = table.split("\n").slice(2);
    assert.equal(rows.length, 2, `${lang}: the table lists two Passes (${rows.length})`);
    for (const row of rows) {
      assert.match(row, /^\| critic-design \(/, `${lang}: nothing spawns this Pass: ${row}`);
    }
  }));

// A handoff placed after Phase 2 would leave the spawn step reading fields nothing has filled yet.
test("each Phase runs two Steps, and the handoff closes Phase 1", () =>
  eachLanguage((doc, lang) => {
    const bodies = phases(doc);
    for (const [name, body] of Object.entries(bodies)) {
      const steps = [...body.matchAll(/^### Step (\d+):/gm)].map((m) => Number(m[1]));
      assert.deepEqual(steps, [1, 2], `${lang}: ${name} runs Step 1 then Step 2`);
    }
    assert.match(bodies["Phase 1"], /^\| outcome_ref /m, `${lang}: the handoff sits in Phase 1`);
    assert.match(bodies["Phase 2"], /`outcome_ref`/, `${lang}: Phase 2 reads that field`);
  }));

// Renaming a field on one side alone leaves the NO-GO rule matching nothing, while the schema and
// the rule both still read as correct prose.
test("the NO-GO rule names the VERDICT_SCHEMA fields it reads", () =>
  eachLanguage((doc, lang) => {
    const schema = doc.match(/assumptions: \[\{ ([^}]+) \}\]/);
    assert.ok(schema, `${lang}: the schema literal is readable`);
    const fields = schema[1].split(",").map((f) => f.trim());
    const rule = doc.slice(doc.indexOf(schema[0]) + schema[0].length).split(/^## /m)[0];
    for (const field of ["irreversible", "underspecified"]) {
      assert.ok(fields.includes(field), `${lang}: the schema carries ${field}`);
      assert.match(rule, new RegExp(`\`${field}\``), `${lang}: the rule reads \`${field}\``);
    }
  }));
