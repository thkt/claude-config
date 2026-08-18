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

// DR-0099 retired the Finding ID route: the audit snapshot stopped carrying a per-finding id, so
// resolving one against ~/.claude/history/ matched nothing.
test("no route resolves a finding through the snapshot history", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.doesNotMatch(doc, /history\//, `${lang}: it does not read the snapshot history`);
    assert.doesNotMatch(doc, /Finding ID/, `${lang}: no Finding ID route remains`);
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
    /渡すのは symptom、再現手順、5 Whys が出した root cause/,
    "ja: all three are passed",
  );
  assert.match(
    readFileSync(skills.en, "utf8"),
    /Pass symptom, repro steps, and the root cause the 5 Whys produced/,
    "en: all three are passed",
  );
});

// The handoff from issue to fix. Without issue's guidance, fix's input route, and the escalation
// threshold all in step, fix rereads a number issue recommended /fix for as plain bug prose.
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
    // A route dropped from the input table leaves that shape of $ARGUMENTS falling to the last row.
    const routes = doc.split("\n\n").find((block) => block.startsWith("| "));
    assert.equal(
      routes.split("\n").length - 2,
      4,
      `${lang}: the input table lists four routes`,
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

// Each condition here is done or it is not, with nothing to state past that. Splitting them into
// a name and a condition, the way census does, leaves the condition column echoing the name.
test("the completion conditions take checklist form in both languages", () => {
  for (const [lang, path] of Object.entries(skills)) {
    assert.ok(existsSync(path), `${path} exists`);
    const doc = readFileSync(path, "utf8");
    const items = doc.match(/^- \[ \] /gm) || [];
    assert.equal(items.length, 5, `${lang}: there are five completion conditions (actual ${items.length})`);
  }
});
