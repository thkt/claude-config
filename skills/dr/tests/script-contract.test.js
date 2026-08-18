import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const at = (lang, ...parts) =>
  join(root, ...(lang === "ja" ? [".ja"] : []), "skills", "dr", ...parts);
const pair = (...parts) => ({ ja: at("ja", ...parts), en: at("en", ...parts) });

const skills = pair("SKILL.md");
const templates = pair("templates", "madr-template.md");
const formats = pair("references", "madr-format.md");
const preChecks = pair("scripts", "pre-check.py");
const validates = pair("scripts", "validate-dr.py");

const outputKeys = (src) => {
  const block = src.slice(src.indexOf("print(json.dumps({"));
  return [...block.matchAll(/^\s{8}"(\w+)":/gm)].map((m) => m[1]);
};
const requiredSections = (src) => [...src.matchAll(/^\s{4}"([^"]+)",$/gm)].map((m) => m[1]);
const recommendedSections = (src) =>
  [...(src.match(/^RECOMMENDED_SECTIONS = \(([^)]*)\)/m)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
    (m) => m[1],
  );

const eachLanguage = async (paths, check) => {
  for (const [lang, path] of Object.entries(paths)) {
    await check(await readFile(path, "utf8"), lang);
  }
};

// A key SKILL.md never names is a key the agent never reads. Without filename the auto-numbering
// is thrown away and the agent invents a name of its own.
test("SKILL.md uses pre-check.py's output keys", async () => {
  const keys = outputKeys(await readFile(preChecks.en, "utf8"));
  assert.ok(keys.includes("filename"), `the output keys are readable (${keys.join(", ")})`);
  assert.ok(keys.length >= 6, `six or more keys are present (${keys.length})`);
  // Only the prose differs between the two copies, so a key that moved on one side alone would
  // leave the two skills documenting different JSON.
  const ja = outputKeys(await readFile(preChecks.ja, "utf8"));
  assert.deepEqual(ja, keys, "both copies return the same keys");

  // number rides inside filename, slug inside both, and status is always "ok", so none of the
  // three reaches the body.
  const consumed = ["filename", "dr_dir", "similar_drs", "date"];
  await eachLanguage(skills, (doc, lang) => {
    for (const key of consumed) {
      assert.match(doc, new RegExp(`\\b${key}\\b`), `${lang}: SKILL.md names ${key}`);
    }
  });
});

// validate-dr.py never checks the status value, so a spelling left over from the rename would
// pass unnoticed and split the supersede identifier in two.
test("madr-format writes the supersede identifier as DR-NNNN", () =>
  eachLanguage(formats, (doc, lang) => {
    assert.match(doc, /superseded by DR-NNNN/, `${lang}: it writes DR-NNNN`);
  }));

// MADR went back to Architectural in v4, so a writer reading the name narrows to architectural
// decisions unless the file states that this skill widens the scope.
test("madr-format states that the scope is not limited to architecture", () => {
  const widened = { ja: /アーキテクチャに限らない決定/, en: /decisions beyond architecture/ };
  return eachLanguage(formats, (doc, lang) => {
    assert.match(doc, widened[lang], `${lang}: it states the widened scope`);
  });
});

const FIELDS = ["status", "date", "decision-makers", "consulted", "informed"];

// A field present in the table but absent from the template leaves the writer adding it by hand.
test("every frontmatter field has a slot in the template", async () => {
  await eachLanguage(skills, (doc, lang) => {
    for (const field of FIELDS) {
      assert.match(doc, new RegExp(`^\\| ${field} `, "m"), `${lang}: the table carries ${field}`);
    }
  });
  await eachLanguage(templates, (doc, lang) => {
    for (const field of FIELDS) {
      assert.match(doc, new RegExp(`^${field}: `, "m"), `${lang}: the template carries ${field}`);
    }
  });
});

// With a required section missing from the template, every DR written fails at Validate with
// missing_section.
test("the required sections match between the template and validate-dr.py", async () => {
  const sections = requiredSections(await readFile(validates.en, "utf8"));
  assert.ok(sections.length >= 4, `the required sections are readable (${sections.join(" / ")})`);
  const ja = requiredSections(await readFile(validates.ja, "utf8"));
  assert.deepEqual(ja, sections, "both copies require the same sections");
  await eachLanguage(templates, (doc, lang) => {
    for (const section of sections) {
      assert.match(doc, new RegExp(`^#{2,3} ${section}$`, "m"), `${lang}: the ${section} heading`);
    }
  });
});

// A gap in the Step numbers hides a stage that was dropped, and a stage nothing names outside the
// table is a stage no instruction sends the reader to.
test("the process Steps run without a gap and every cited stage has a row", () => {
  const CITED = ["Validate", "Index"];
  return eachLanguage(skills, (doc, lang) => {
    const rows = [...doc.matchAll(/^\| (\d+) {4}\| (\S+)/gm)];
    const steps = rows.map((m) => Number(m[1]));
    assert.ok(steps.length >= 5, `${lang}: the process table is readable (${steps.length})`);
    assert.deepEqual(
      steps,
      steps.map((_, i) => i + 1),
      `${lang}: the Steps run 1 through ${steps.length}`,
    );
    const stages = rows.map((m) => m[2]);
    for (const stage of CITED) {
      assert.ok(stages.includes(stage), `${lang}: the cited stage ${stage} has a row`);
      const uses = doc.split(stage).length - 1;
      assert.ok(uses >= 2, `${lang}: ${stage} is named beyond its own row (${uses})`);
    }
    // A number reference would shift the moment a stage is inserted, so stages are cited by name.
    assert.doesNotMatch(doc, /Step \d/, `${lang}: nothing points at a Step by number`);
    // A stage whose name is also a section heading makes every later mention ambiguous, and the
    // collision shows on the English side alone because the Japanese section names differ.
    for (const stage of stages) {
      const collides = new RegExp(`^## ${stage}$`, "m");
      assert.doesNotMatch(doc, collides, `${lang}: ${stage} is a stage and not also a section`);
    }
  });
});

// A step citing a section the file no longer carries sends the reader nowhere.
test("every section a step cites exists", () =>
  eachLanguage(skills, (doc, lang) => {
    const cited = [...doc.matchAll(/\(§ ([^)]+)\)/g)].map((m) => m[1]);
    assert.equal(cited.length, 4, `${lang}: the body cites four sections`);
    for (const name of cited) {
      assert.match(doc, new RegExp(`^## ${name}$`, "m"), `${lang}: ## ${name} exists`);
    }
  }));

// The opening sentence of Decision Type says the type changes the recommended topics alone, so a
// fourth column puts the table at odds with the sentence above it. Nothing reads a per-type line
// cap either: the type is never written into the DR, so validate-dr.py cannot look one up.
test("the decision type table carries type, use case, and topics only", () =>
  eachLanguage(skills, (doc, lang) => {
    const row = doc.split("\n").find((line) => line.startsWith("| technology-selection"));
    assert.ok(row, `${lang}: the decision type table is readable`);
    assert.equal(row.split("|").length - 2, 3, `${lang}: the row carries three columns`);
  }));

// A remove-or-merge proposal is sent to Reassessment Triggers. Three places carry it and all three
// are needed: the template slot gives the writer somewhere to put it, the body tells them to, and
// madr-format is what stops the section from being filed as optional while the body requires it.
// 58 of 101 existing DRs lack the section, which is what a missing piece produces.
test("every recommended section reaches the template, the body, and the format reference", async () => {
  const sections = recommendedSections(await readFile(validates.en, "utf8"));
  assert.ok(
    sections.length >= 1,
    `the recommended sections are readable (${sections.join(" / ")})`,
  );
  const ja = recommendedSections(await readFile(validates.ja, "utf8"));
  assert.deepEqual(ja, sections, "both copies recommend the same sections");
  for (const section of sections) {
    await eachLanguage(templates, (doc, lang) => {
      assert.match(doc, new RegExp(`^#{2,3} ${section}$`, "m"), `${lang}: the ${section} heading`);
    });
    await eachLanguage(skills, (doc, lang) => {
      assert.match(doc, new RegExp(section), `${lang}: the body names ${section}`);
    });
    await eachLanguage(formats, (doc, lang) => {
      const row = doc.split("\n").find((line) => line.startsWith(`| ${section} `));
      assert.ok(row, `${lang}: madr-format carries a ${section} row`);
      const optional = doc.slice(doc.search(/^## (任意セクション|Optional Sections)$/m));
      assert.ok(!optional.includes(section), `${lang}: ${section} is not filed as optional`);
    });
  }
});
