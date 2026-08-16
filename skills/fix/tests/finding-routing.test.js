import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skills = {
  ja: join(root, ".ja", "skills", "fix", "SKILL.md"),
  en: join(root, "skills", "fix", "SKILL.md"),
};
const schema = join(root, "agents", "_lib", "finding-schema.md");
const integrator = join(root, "agents", "enhancers", "enhancer-integration.md");
const generator = join(root, "agents", "generators", "generator-test.md");

// The registry in finding-schema.md decides the ID prefixes. Some carry digits, A11Y among them,
// so a regex admitting letters alone drops the Finding ID and falls to the Standard Flow. It
// raises no error and quietly runs the Outcome Anchor and the Build Check.
test("the Finding ID regex admits every prefix in the registry", () => {
  const registry = readFileSync(schema, "utf8");
  const prefixes = [...registry.matchAll(/^\| ([A-Z0-9]+) {2,}\| reviewer-/gm)].map((m) => m[1]);
  assert.ok(prefixes.includes("A11Y"), "the registry carries a prefix with digits");
  assert.ok(prefixes.length >= 10, `the prefixes are readable from the registry (${prefixes.length})`);

  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const found = doc.match(/`\/(\^\[[^`]+?)\/`/);
    assert.ok(found, `${lang}: the Finding ID regex is readable from SKILL.md`);
    const pattern = new RegExp(found[1]);
    for (const prefix of prefixes) {
      assert.match(`${prefix}-001`, pattern, `${lang}: ${prefix}-001 passes as a Finding ID`);
    }
    assert.doesNotMatch("just a bug description", pattern, `${lang}: prose does not become a Finding ID`);
    // This keeps it from clashing with the issue handoff input. Without demanding a letter in the
    // prefix, 1-2 would match both rows.
    assert.doesNotMatch("1-2", pattern, `${lang}: a digits-only prefix does not become a Finding ID`);
  }
});

// The severity vocabulary. finding-schema and enhancer-integration's output both write medium, so
// abbreviating it to med in the triage table would stop matching the snapshot's value.
test("the severity vocabulary matches between the schema and fix's triage", () => {
  for (const path of [schema, integrator]) {
    assert.match(
      readFileSync(path, "utf8"),
      /critical \/ high \/ medium \/ low/,
      `${path} lists the four severity levels`,
    );
  }
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /severity low \/ medium/, `${lang}: the triage writes medium`);
    assert.doesNotMatch(doc, /severity low \/ med\b/, `${lang}: no med abbreviation remains`);
  }
});

// A snapshot finding carries four things: file, line, severity, and summary.
// enhancer-integration.md § Auto-fix marking states outright that it carries no fix_type, so
// branching on that word would read a field that does not exist.
test("fix does not branch on a field absent from the snapshot", () => {
  const src = readFileSync(integrator, "utf8");
  assert.match(src, /no dedicated fix_type field/, "the integrator states outright that fix_type is absent");
  for (const field of ["file", "line", "severity", "summary"]) {
    assert.match(src, new RegExp(`findings\\[\\]\\.${field}`), `the snapshot carries ${field}`);
  }
  for (const [lang, path] of Object.entries(skills)) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /fix_type/, `${lang}: it does not branch on fix_type`);
  }
});

// generator-test takes root_cause as optional and binds it to the behavior once passed. fix's
// Non-obvious path obtains the root cause at step 1, so not passing it leaves that optional
// permanently empty.
test("what is handed to generator-test matches the agent's Input", () => {
  const agent = readFileSync(generator, "utf8");
  assert.match(agent, /^\| root_cause \| optional \|/m, "the agent takes root_cause as optional");
  assert.match(agent, /When a root cause is passed/, "the agent states what root_cause is for");
  assert.match(
    readFileSync(skills.ja, "utf8"),
    /渡すのは symptom、再現手順、step 1 の root cause/,
    "ja: all three are passed",
  );
  assert.match(
    readFileSync(skills.en, "utf8"),
    /Pass symptom, repro steps, and the root cause from step 1/,
    "en: all three are passed",
  );
});

// The handoff from issue to fix. Without issue's guidance, fix's input route, and the escalation
// threshold all in step, fix rereads a number issue recommended /fix for as a Standard Flow
// input.
test("the handoff from issue to fix lines up on both sides", () => {
  const issues = {
    ja: join(root, ".ja", "skills", "issue", "SKILL.md"),
    en: join(root, "skills", "issue", "SKILL.md"),
  };
  for (const [lang, path] of Object.entries(issues)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /`\/fix <(番号|number)>`/, `${lang}: issue recommends /fix with a number`);
    assert.match(doc, /1[〜-]3 ?(ファイル|files)/, `${lang}: it states the 1-3 files lower bound`);
    assert.match(doc, /(4 ファイル以上|4 or more files)/, `${lang}: four or more files go to build`);
  }
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /`\/\^#\?\[0-9\]\+\$\/`/, `${lang}: fix carries the issue number pattern`);
    assert.match(doc, /gh issue view/, `${lang}: the body is read with gh issue view`);
    assert.match(
      doc,
      /(次の 4 形式|one of four forms)/,
      `${lang}: the input enumeration counts the issue number`,
    );
    assert.match(
      doc,
      /(起票済み issue の番号|the number of a filed issue)/,
      `${lang}: the issue number is listed in the enumeration`,
    );
    assert.match(
      doc.split("---")[1],
      /(1〜3 ファイル|1-3 files)/,
      `${lang}: the description allows the issue handoff`,
    );
    assert.match(
      doc,
      /(4 ファイル以上|4\+ files)/,
      `${lang}: the escalation threshold is four files, the same as on issue's side`,
    );
  }
  const frontmatter = readFileSync(skills.en, "utf8").split("---")[1];
  assert.match(frontmatter, /Bash\(gh issue view:\*\)/, "allowed-tools grants gh issue view");
});

// The completion conditions are a checklist. Reverting them to a table turns the Required column
// into a row of Yes and leaves nothing to fill in.
test("the completion conditions take checklist form in both languages", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} exists`);
    const doc = readFileSync(path, "utf8");
    const items = doc.match(/^- \[ \] /gm) || [];
    assert.equal(items.length, 5, `${lang}: there are five completion conditions (actual ${items.length})`);
  }
});
