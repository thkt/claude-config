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
const agentPath = join(root, "agents", "critics", "critic-design.md");

const eachLanguage = async (check) => {
  for (const [lang, path] of Object.entries(skills)) {
    check(await readFile(path, "utf8"), lang);
  }
};

// The agent definition decides the verdict critic-design returns. Were challenge to instruct it
// to return GO / NO-GO, the agent definition and the spawn prompt would conflict and the
// receiving side would hold a value it cannot interpret.
test("challenge takes critic-design's verdict as it stands", async () => {
  const definition = await readFile(agentPath, "utf8");
  const verdicts = [...definition.matchAll(/^\| (confirmed|weakened|needs_revision) +\|/gm)].map(
    (m) => m[1],
  );
  assert.equal(verdicts.length, 3, `three agent verdicts are readable (${verdicts.join(", ")})`);

  await eachLanguage((doc, lang) => {
    for (const verdict of verdicts) {
      assert.match(doc, new RegExp(verdict), `${lang}: it states how ${verdict} is handled`);
    }
    assert.doesNotMatch(
      doc,
      /verdict: "GO" \| "NO-GO"/,
      `${lang}: it does not make the agent return GO / NO-GO`,
    );
  });
});

// Writing weaknesses as string[] drops severity during the match and misjudges the duplicates.
test("the shape of weaknesses matches the agent's Output", async () => {
  assert.match(
    await readFile(agentPath, "utf8"),
    /Each item includes viewpoint, severity, finding, evidence/,
    "the agent enumerates what a weakness holds",
  );
  await eachLanguage((doc, lang) => {
    assert.doesNotMatch(doc, /weaknesses: string\[\]/, `${lang}: it is not written as string[]`);
    assert.match(doc, /severity/, `${lang}: it names what an item holds`);
  });
});

// A Pass listed but never spawned would leave the reader expecting an attack that never lands.
test("the Phase 2 Pass table matches the steps", () =>
  eachLanguage((doc, lang) => {
    const phase2 = doc.slice(doc.indexOf("## Phase 2"));
    const passes = phase2.match(/^\| critic-design \(/gm) || [];
    assert.equal(passes.length, 2, `${lang}: the Passes are two critic-design (${passes.length})`);
    assert.doesNotMatch(phase2, /^\| advisor /m, `${lang}: no Pass that never starts is listed`);
  }));

// A handoff sitting outside Phase 1 reads as a stage of its own, and one placed after Phase 2
// would leave the spawn step reading fields nothing has filled yet.
test("the handoff is the closing Step of Phase 1", () =>
  eachLanguage((doc, lang) => {
    const phase1 = doc.slice(doc.indexOf("## Phase 1"), doc.indexOf("## Phase 2"));
    assert.match(phase1, /^\| outcome_ref /m, `${lang}: the handoff table sits inside Phase 1`);
    const steps = [...phase1.matchAll(/^### Step (\d+):/gm)].map((m) => Number(m[1]));
    assert.deepEqual(steps, [1, 2], `${lang}: Phase 1 runs Step 1 then Step 2`);
    const phase2 = doc.slice(doc.indexOf("## Phase 2"));
    assert.match(phase2, /`outcome_ref`/, `${lang}: Phase 2 reads the field the handoff defines`);
  }));

// Renaming a field on one side alone leaves the NO-GO rule matching nothing, while the schema and
// the rule both still read as correct prose.
test("the NO-GO rule names the VERDICT_SCHEMA fields it reads", () =>
  eachLanguage((doc, lang) => {
    const schema = doc.match(/assumptions: \[\{ ([^}]+) \}\]/);
    assert.ok(schema, `${lang}: the schema literal is readable`);
    const fields = schema[1].split(",").map((f) => f.trim());
    const rule = doc.slice(doc.indexOf(schema[0]) + schema[0].length);
    for (const field of ["irreversible", "underspecified"]) {
      assert.ok(fields.includes(field), `${lang}: the schema carries ${field}`);
      assert.match(rule, new RegExp(`\`${field}\``), `${lang}: the rule reads \`${field}\``);
    }
  }));
