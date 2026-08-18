import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "dr", "SKILL.md"),
  en: join(root, "skills", "dr", "SKILL.md"),
};
const templates = {
  ja: join(root, ".ja", "skills", "dr", "templates", "madr-template.md"),
  en: join(root, "skills", "dr", "templates", "madr-template.md"),
};
const formats = {
  ja: join(root, ".ja", "skills", "dr", "references", "madr-format.md"),
  en: join(root, "skills", "dr", "references", "madr-format.md"),
};
// The scripts are identical copies on both sides, so one path covers the pair.
const preCheck = join(root, "skills", "dr", "scripts", "pre-check.py");
const validate = join(root, "skills", "dr", "scripts", "validate-dr.py");

// A key SKILL.md never names is a key the agent never reads. Without filename the auto-numbering
// is thrown away and the agent invents a name of its own.
test("SKILL.md uses pre-check.py's output keys", () => {
  const src = readFileSync(preCheck, "utf8");
  const block = src.slice(src.indexOf("print(json.dumps({"));
  const keys = [...block.matchAll(/^\s{8}"(\w+)":/gm)].map((m) => m[1]);
  assert.ok(keys.includes("filename"), `the output keys are readable (${keys.join(", ")})`);
  assert.ok(keys.length >= 6, `six or more keys are present (${keys.length})`);

  // number rides inside filename, slug inside both, and status is always "ok", so none of the
  // three reaches the body.
  const consumed = ["filename", "dr_dir", "similar_drs", "date"];
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    for (const key of consumed) {
      assert.match(doc, new RegExp(`\\b${key}\\b`), `${lang}: SKILL.md names ${key}`);
    }
  }
});

// This rejects a spelling left behind after the rename to DR. validate-dr.py does not check the
// status value, so a split spelling would let both through.
test("the supersede identifier is DR-NNNN everywhere", () => {
  for (const group of [skills, templates, formats]) {
    for (const [lang, path] of Object.entries(group)) {
      const doc = readFileSync(path, "utf8");
      assert.doesNotMatch(doc, /ADR-NNNN/, `${lang}: no ADR-NNNN remains in ${path}`);
    }
  }
  for (const [lang, path] of Object.entries(formats)) {
    assert.match(readFileSync(path, "utf8"), /superseded by DR-NNNN/, `${lang}: it writes DR-NNNN`);
  }
});

// DR names a decision beyond architecture. An old ADR left in an instruction or a convention
// makes the writer read only architectural decisions as recordable. The exclusions form an
// explicit list so a newly introduced ADR- is caught.
test("no live instruction or convention still carries the old name ADR", () => {
  const EXEMPT = [
    // A summary of Fowler's article. It quotes ADR as the source's own term and declares so in
    // its body.
    "skills/dr/references/fowler-adr.md",
    // This test itself uses ADR- in a negative assert.
    "skills/dr/tests/script-contract.test.js",
  ];
  const fowler = {
    ja: [
      join(root, ".ja", "skills", "dr", "references", "fowler-adr.md"),
      /このファイルでは ADR と呼ぶ/,
    ],
    en: [join(root, "skills", "dr", "references", "fowler-adr.md"), /it says ADR throughout/],
  };
  for (const [lang, [path, declaration]] of Object.entries(fowler)) {
    assert.match(
      readFileSync(path, "utf8"),
      declaration,
      `${lang}: the body declares the grounds for the exclusion`,
    );
  }
  // when_to_use lists the words a user types. ADR stays listed so it reaches whoever calls it by
  // the old name.
  const TRIGGERS = /^when_to_use:.*$/gm;
  const scanned = [];
  for (const prefix of ["", ".ja"]) {
    for (const dir of ["skills", "agents", "rules", "workflows"]) {
      const base = join(root, prefix, dir);
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.(md|js|py)$/.test(entry.name)) continue;
        const full = join(entry.parentPath ?? entry.path, entry.name);
        const rel = full.slice(join(root, prefix).length + 1);
        if (EXEMPT.includes(rel) || rel.includes("__pycache__")) continue;
        scanned.push(rel);
        const text = readFileSync(full, "utf8").replace(TRIGGERS, "");
        assert.doesNotMatch(
          text,
          /\bADRs?\b/,
          `${prefix || "en"}: ${rel} still carries the old name ADR`,
        );
      }
    }
  }
  assert.ok(scanned.length > 100, `the number scanned (${scanned.length})`);
  assert.doesNotMatch(readFileSync(join(root, "README.md"), "utf8"), /\bADRs?\b/, "README.md");
});

// This mechanizes DR-0090's Confirmation. Work products were unified under .claude/workspace/, so
// a live instruction naming a workspace/ that does not sit directly under another project's root
// leaves the reference unresolved.
test("no live instruction or convention names a workspace/ without .claude/", () => {
  const BARE_WORKSPACE = /(?<!\.claude\/)(?<![\w/.])workspace\//;
  const scanned = [];
  for (const prefix of ["", ".ja"]) {
    for (const dir of ["skills", "agents", "rules", "workflows"]) {
      const base = join(root, prefix, dir);
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.(md|js|py)$/.test(entry.name)) continue;
        const full = join(entry.parentPath ?? entry.path, entry.name);
        const rel = full.slice(join(root, prefix).length + 1);
        // This test itself uses a bare workspace/ in a negative assert.
        if (rel.includes("__pycache__") || rel === "skills/dr/tests/script-contract.test.js") {
          continue;
        }
        scanned.push(rel);
        assert.doesNotMatch(
          readFileSync(full, "utf8"),
          BARE_WORKSPACE,
          `${prefix || "en"}: ${rel} names a workspace/ without .claude/`,
        );
      }
    }
  }
  assert.ok(scanned.length > 100, `the number scanned (${scanned.length})`);
});

// MADR is an external spec whose name went back to Architectural in v4. Without stating that this
// skill widens the scope, a writer reading the name narrows to architectural decisions alone.
test("madr-format states that the scope is not limited to architecture", () => {
  assert.match(
    readFileSync(formats.ja, "utf8"),
    /アーキテクチャに限らない決定/,
    "ja: it states the widened scope",
  );
  assert.match(
    readFileSync(formats.en, "utf8"),
    /decisions beyond architecture/,
    "en: it states the widened scope",
  );
});

// The frontmatter table and the template are the two faces a writer moves between. A slot present
// in the table but absent from the template leaves the writer adding the field by hand.
test("every frontmatter field has a slot in the template", () => {
  const FIELDS = ["status", "date", "decision-makers", "consulted", "informed"];
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    for (const field of FIELDS) {
      assert.match(
        doc,
        new RegExp(`^\\| ${field} `, "m"),
        `${lang}: the table carries a ${field} row`,
      );
    }
  }
  for (const [lang, path] of Object.entries(templates)) {
    const doc = readFileSync(path, "utf8");
    for (const field of FIELDS) {
      assert.match(
        doc,
        new RegExp(`^${field}: `, "m"),
        `${lang}: the template carries a ${field} slot`,
      );
    }
  }
});

// validate-dr.py's required sections against the template's headings. With either missing, every
// DR written fails at Phase 4 with missing_section.
test("the required sections match between the template and validate-dr.py", () => {
  const src = readFileSync(validate, "utf8");
  const sections = [...src.matchAll(/^\s{4}"([^"]+)",$/gm)].map((m) => m[1]);
  assert.ok(sections.length >= 4, `the required sections are readable (${sections.join(" / ")})`);
  for (const [lang, path] of Object.entries(templates)) {
    const doc = readFileSync(path, "utf8");
    for (const section of sections) {
      assert.match(doc, new RegExp(`^#{2,3} ${section}$`, "m"), `${lang}: the ${section} heading`);
    }
  }
});

// A gap in the Step numbers hides a stage that was dropped, and a stage named outside the table
// sends the reader looking for work that has no row.
test("the process Steps run without a gap and every cited stage has a row", () => {
  const CITED = ["Validate", "Index"];
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const rows = [...doc.matchAll(/^\| (\d+) {4}\| (\S+)/gm)];
    const steps = rows.map((m) => Number(m[1]));
    assert.ok(steps.length >= 5, `${lang}: the process table is readable (${steps.length})`);
    const run = steps.map((_, i) => i + 1);
    assert.deepEqual(steps, run, `${lang}: the Steps run 1 through ${steps.length}`);
    const stages = rows.map((m) => m[2]);
    for (const stage of CITED) {
      assert.ok(stages.includes(stage), `${lang}: the cited stage ${stage} has a row`);
      const uses = doc.split(stage).length - 1;
      assert.ok(uses >= 2, `${lang}: ${stage} is named beyond its own row (${uses})`);
    }
    // A number reference would shift the moment a stage is inserted, so stages are cited by name.
    assert.doesNotMatch(doc, /Step \d/, `${lang}: nothing points at a Step by number`);
  }
});

// A step citing a section the file no longer carries sends the reader nowhere.
test("every section a step cites exists", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const cited = [...doc.matchAll(/\(§ ([^)]+)\)/g)].map((m) => m[1]);
    assert.equal(cited.length, 4, `${lang}: the body cites four sections`);
    for (const name of cited) {
      assert.match(doc, new RegExp(`^## ${name}$`, "m"), `${lang}: ## ${name} exists`);
    }
  }
});
