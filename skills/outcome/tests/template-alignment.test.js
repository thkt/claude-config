import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const templates = {
  ja: join(root, ".ja", "skills", "outcome", "templates", "outcome.md"),
  en: join(root, "skills", "outcome", "templates", "outcome.md"),
};
const skills = {
  ja: join(root, ".ja", "skills", "outcome", "SKILL.md"),
  en: join(root, "skills", "outcome", "SKILL.md"),
};
const rules = {
  ja: join(root, ".ja", "rules", "core", "OUTCOME.md"),
  en: join(root, "rules", "core", "OUTCOME.md"),
};
const asserts = {
  ja: join(root, ".ja", "workflows", "assert.js"),
  en: join(root, "workflows", "assert.js"),
};
// The script is an identical copy on both sides, so one path covers the pair.
const script = join(root, "skills", "outcome", "scripts", "validate-outcome.py");

// assert's bootstrap and challenge name the headings of a generated OUTCOME.md as their digest
// targets. A wobbling spelling returns an empty digest and downstream treats the outcome as
// absent.
const HEADINGS = [
  /^## Outcome state$/m,
  /^### Behavior$/m,
  /^### Indicators$/m,
  /^## Non-goals$/m,
  /^## Constraints$/m,
];

test("the template headings stay English and match across both languages", () => {
  for (const [lang, path] of Object.entries(templates)) {
    assert.ok(existsSync(path), `${path} exists`);
    const doc = readFileSync(path, "utf8");
    for (const heading of HEADINGS) {
      assert.match(doc, heading, `${lang}: the template carries ${heading}`);
    }
  }
});

// The three Indicators rows are the categories rules/core/OUTCOME.md § Content defines. A dropped
// row leaves the writer unable to recall the category that vanished from the template.
//
// The separator differs per language: textlint closes the spaces around a slash on the .ja side,
// and a shared string would push that spelling back onto the English prose.
const indicatorList = { ja: "Time/Error rate/Value", en: "Time / Error rate / Value" };

test("the Indicators categories match between the template and the rules", () => {
  for (const [lang, path] of Object.entries(rules)) {
    const doc = readFileSync(path, "utf8");
    assert.ok(
      doc.includes(indicatorList[lang]),
      `${lang}: the rules list Time, Error rate, and Value`,
    );
  }
  for (const [lang, path] of Object.entries(templates)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /^\| Time {2,}\|/m, `${lang}: the Time row`);
    assert.match(doc, /^\| Error rate \|/m, `${lang}: the Error rate row`);
    assert.match(doc, /^\| Value {2,}\|/m, `${lang}: the Value row`);
  }
});

// The word for the emptiness check. The writer writes TBD per the template's instruction, the
// script decides emptiness by that word, and SKILL.md's branch table explains the result.
// Rephrasing just one of them sends an unfilled OUTCOME.md from the generate flow into the update
// flow.
test("the emptiness word is TBD across the template, SKILL.md, and the script", () => {
  for (const [lang, path] of Object.entries(templates)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /TBD/, `${lang}: the template instructs how to write TBD`);
  }
  const branchRow = {
    ja: /Behavior が空、または TBD のみ\s*\|/,
    en: /Behavior blank, or TBD only\s*\|/,
  };
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, branchRow[lang], `${lang}: the branch table row routes TBD to generate`);
  }
  assert.match(
    readFileSync(script, "utf8"),
    /content\.upper\(\) == "TBD"/,
    "the script treats TBD as empty",
  );
});

// The wiring that leaves assert's emptiness check to the script. Reverting the prompt to eyeing
// TBD itself would split /outcome's criteria from assert's.
test("assert.js decides whether an outcome exists from validate-outcome.py's state", () => {
  for (const [lang, path] of Object.entries(asserts)) {
    const src = readFileSync(path, "utf8");
    // It is assembled through bundled(), so the match runs on the relative path argument rather
    // than a literal path. Resolving under both the dev tree and a plugin distribution is
    // bundled's responsibility.
    assert.match(
      src,
      /OUTCOME_VALIDATOR = bundled\("skills\/outcome\/scripts\/validate-outcome\.py"\)/,
      `${lang}: it carries the script path`,
    );
    assert.match(src, /\$\{OUTCOME_VALIDATOR\}/, `${lang}: the bootstrap prompt runs the script`);
    assert.doesNotMatch(
      src,
      /all items are TBD|全項 TBD/,
      `${lang}: no eyeball check for TBD remains`,
    );
  }
});

// The words naming the digest targets. assert.js, challenge, and validate-outcome.py's required
// sections all name the same three. Reverting one to a parent section name such as Outcome state
// mixes the opening sentence's aspirational wording into the digest.
test("the digest targets are Behavior, Non-goals, and Constraints everywhere", () => {
  const challenge = {
    ja: join(root, ".ja", "skills", "challenge", "SKILL.md"),
    en: join(root, "skills", "challenge", "SKILL.md"),
  };
  for (const [lang, path] of Object.entries(asserts)) {
    const src = readFileSync(path, "utf8");
    assert.match(
      src,
      /Behavior \/ Non-goals \/ Constraints/,
      `${lang}: assert.js's digest wording`,
    );
  }
  for (const [lang, path] of Object.entries(challenge)) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /Behavior \/ Non-goals \/ Constraints/, `${lang}: challenge's outcome_ref`);
    assert.doesNotMatch(
      doc,
      /Outcome state \/ Non-goals/,
      `${lang}: a parent section name is not made a digest target`,
    );
  }
  assert.match(
    readFileSync(script, "utf8"),
    /FILLED_SECTIONS = \("Behavior", "Non-goals", "Constraints"\)/,
    "the script's fill check looks at the same three sections",
  );
});

// The wiring that leaves the branching to the script. Once SKILL.md stops calling it, the
// decision returns to eyeballing.
test("SKILL.md branches on validate-outcome.py and runs it through the validation too", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    assert.match(
      doc,
      /\$\{CLAUDE_SKILL_DIR\}\/scripts\/validate-outcome\.py \.claude\/OUTCOME\.md/,
      `${lang}: the branch runs the script`,
    );
    assert.match(doc, /^\| absent \|/m, `${lang}: the state absent row`);
    assert.match(doc, /^\| empty {2}\|/m, `${lang}: the state empty row`);
    assert.match(doc, /^\| ok {5}\|/m, `${lang}: the state ok row`);
    assert.match(
      doc,
      /Bash\(\$\{CLAUDE_SKILL_DIR\}\/scripts\/\*\)/,
      `${lang}: allowed-tools grants running the script`,
    );
    // A home-anchored grant names the dev tree, which a plugin copy of the skill never matches.
    assert.doesNotMatch(doc.split("---")[1], /\$HOME|~\//, `${lang}: no hardcoded home path`);
    const validateSteps = doc.match(/validate-outcome\.py/g) || [];
    assert.ok(
      validateSteps.length >= 3,
      `${lang}: the script runs in all three places: branch, generate, update (actual ${validateSteps.length})`,
    );
  }
});

// The instruction to drop an optional block that was never collected, paired with the side that
// rejects a {...} left behind. With the instruction alone, a placeholder stays in
// .claude/OUTCOME.md and assert's digest reads it as Behavior.
test("the generate steps drop the optional block and the script rejects a leftover placeholder", () => {
  assert.match(
    readFileSync(skills.ja, "utf8"),
    /Indicators はセクションごと落とす/,
    "ja: the instruction to drop Indicators",
  );
  assert.match(
    readFileSync(skills.en, "utf8"),
    /drop Indicators with its heading/,
    "en: the instruction to drop Indicators",
  );
  for (const [lang, path] of Object.entries(skills)) {
    assert.match(
      readFileSync(path, "utf8"),
      /placeholder_left/,
      `${lang}: the generate steps name the script's placeholder_left`,
    );
  }
  assert.match(
    readFileSync(script, "utf8"),
    /placeholder_left:/,
    "the script pushes placeholder_left into errors",
  );
});

// The generate flow drops the opening prose and Indicators, and nothing else writes them. Without
// the update flow naming both, the template carries two sections no path ever fills, and the
// missing_indicator warning has no step that reads it.
test("the update flow can add what generate dropped, and reads the indicator warning", () => {
  for (const [lang, path] of Object.entries(skills)) {
    const doc = readFileSync(path, "utf8");
    const update = doc.slice(doc.search(/^## (Update|更新)$/m));
    assert.ok(update, `${lang}: an update section exists`);
    const prose = lang === "ja" ? /冒頭文/ : /opening prose/;
    assert.match(update, prose, `${lang}: the update flow names the opening prose`);
    assert.match(update, /Indicators/, `${lang}: the update flow names Indicators`);
    assert.match(update, /missing_indicator/, `${lang}: a step reads the indicator warning`);
  }
  assert.match(
    readFileSync(script, "utf8"),
    /missing_indicator:/,
    "the script pushes missing_indicator into warnings",
  );
});
