import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "challenge", "SKILL.md"),
  en: join(root, "skills", "challenge", "SKILL.md"),
};
const agents = {
  ja: join(root, ".ja", "agents", "critics", "critic-design.md"),
  en: join(root, "agents", "critics", "critic-design.md"),
};

// The agent definition decides the verdict critic-design returns. Were challenge to instruct it
// to return GO / NO-GO, the agent definition and the Task prompt would conflict and the receiving
// side would hold a value it cannot interpret.
test("challenge takes critic-design's verdict as it stands", () => {
  const table = readFileSync(agents.en, "utf8");
  const verdicts = [...table.matchAll(/^\| (confirmed|weakened|needs_revision) +\|/gm)].map(
    (m) => m[1],
  );
  assert.equal(verdicts.length, 3, `three agent verdicts are readable (${verdicts.join(", ")})`);

  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} exists`);
    const doc = readFileSync(path, "utf8");
    for (const verdict of verdicts) {
      assert.match(doc, new RegExp(verdict), `${lang}: it states how ${verdict} is handled`);
    }
    assert.doesNotMatch(
      doc,
      /verdict: "GO" \| "NO-GO"/,
      `${lang}: it does not make the agent return GO / NO-GO`,
    );
  }
});

// weaknesses is an array of items carrying viewpoint, severity, finding, evidence, and probe.
// Writing it as string[] drops severity during the match and misjudges the duplicates.
test("the shape of weaknesses matches the agent's Output", () => {
  assert.match(
    readFileSync(agents.en, "utf8"),
    /Each item includes viewpoint, severity, finding, evidence/,
    "the agent enumerates what a weakness holds",
  );
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.doesNotMatch(doc, /weaknesses: string\[\]/, `${lang}: it is not written as string[]`);
    assert.match(doc, /severity/, `${lang}: it names what an item holds`);
  }
});

// Phase 2 runs two critic-design agents and nothing else. The Passes listed in the table match
// what the steps start.
test("the Phase 2 Pass table matches the steps", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const phase2 = doc.slice(doc.indexOf(lang === "ja" ? "## Phase 2" : "## Phase 2"));
    const passes = phase2.match(/^\| critic-design \(/gm) || [];
    assert.equal(passes.length, 2, `${lang}: the Passes are two critic-design (${passes.length})`);
    assert.doesNotMatch(phase2, /^\| advisor /m, `${lang}: no Pass that never starts is listed`);
  }
});
